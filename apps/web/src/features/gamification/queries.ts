import "server-only";

import {
  blocks,
  focus,
  gamification,
  habits as habitsRepo,
  tasks,
  weeklyGoals,
} from "@momentum/db";
import {
  IMPLEMENTED_COSMETIC_KIND,
  XP_DAILY_CAPS,
  levelProgress,
  questFactsFor,
  questProgress,
  xpCapWindow,
} from "@momentum/core/gamification";
import { addDays, nowInstant, startOfDay, todayIn, weekOf } from "@momentum/core/time";
import type {
  FocusSession,
  Instant,
  QuestAssignment,
  QuestDefinition,
  Uuid,
  XpSourceType,
} from "@momentum/core/types";

import type {
  AchievementRow,
  CosmeticRow,
  ProgressBadge,
  ProgressPageData,
  QuestRow,
  WeeklyGoalRow,
} from "@/features/gamification/types";
import { requireSession } from "@/lib/auth/session";

// Nothing here computes an award: progress is derived from source rows for
// display, and a claim is checked again in SQL against the same rows.

export const XP_HISTORY_LIMIT = 12;

export async function getProgressBadge(): Promise<ProgressBadge> {
  const { supabase, userId, profile } = await requireSession();

  const now = nowInstant();
  const today = todayIn(profile.timezone, now);
  const week = weekOf(today, profile.weekStart);

  const [frame, unlocked, claimed] = await Promise.all([
    gamification.equippedCosmeticKey(supabase, userId, IMPLEMENTED_COSMETIC_KIND),
    gamification.listUnlockedWithNames(supabase, userId),
    weeklyGoals.listForWeek(supabase, userId, week.start),
  ]);

  return {
    ...levelProgress(profile.xp),
    coins: profile.coins,
    frame,
    unlocked,
    weeklyGoalsClaimed: claimed.filter((goal) => goal.completedAt !== null).length,
  };
}

export async function getProgressPage(): Promise<ProgressPageData> {
  const { supabase, userId, profile } = await requireSession();
  const timezone = profile.timezone;

  const now = nowInstant();
  const today = todayIn(timezone, now);
  const week = weekOf(today, profile.weekStart);

  // `startOfDay` knows the local days either side of a DST transition are 23 or 25 hours.
  const weekWindow = {
    start: startOfDay(week.start, timezone),
    end: startOfDay(addDays(week.start, 7), timezone),
  };
  // The caps panel measures the ledger trigger's window (the last 24 hours,
  // rolling), not the local day, or it would read "0 of 200" just after midnight.
  const capWindow = xpCapWindow(now);

  const [
    assignments,
    questDefinitions,
    achievementDefinitions,
    unlocked,
    cosmeticDefinitions,
    owned,
    goals,
    completedTasks,
    focusSessions,
    habitCompletions,
    completedBlocks,
    recent,
    awardedToday,
  ] = await Promise.all([
    // Idempotent; resolves the period from the profile itself.
    gamification.ensureQuests(supabase),
    gamification.listQuestDefinitions(supabase),
    gamification.listAchievementDefinitions(supabase),
    gamification.listUnlockedAchievements(supabase, userId),
    gamification.listCosmeticDefinitions(supabase),
    gamification.listOwnedCosmetics(supabase, userId),
    weeklyGoals.listForWeek(supabase, userId, week.start),
    tasks.listCompletedBetween(supabase, userId, weekWindow),
    focusSessionsFor(supabase, userId, weekWindow),
    habitsRepo.listCompletionsBetween(supabase, userId, week.start, addDays(week.start, 6)),
    blocks.listCompletedBetween(supabase, userId, weekWindow),
    gamification.listXpEvents(supabase, userId, XP_HISTORY_LIMIT),
    gamification.xpAwardedBetween(supabase, userId, capWindow),
  ]);

  const sources = {
    completedTasks,
    focusSessions,
    habitCompletions,
    completedBlocks,
  };
  const todayFacts = questFactsFor(sources, timezone, [today]);
  const weekFacts = questFactsFor(sources, timezone, week.days);

  const definitionById = new Map<Uuid, QuestDefinition>(
    questDefinitions.map((definition) => [definition.id, definition]),
  );

  const toQuestRow = (assignment: QuestAssignment): QuestRow[] => {
    const definition = definitionById.get(assignment.questId);
    if (definition === undefined) return [];

    const facts = assignment.period === "daily" ? todayFacts : weekFacts;
    const progress = questProgress(facts, definition.metric, definition.target);

    return [
      {
        assignmentId: assignment.id,
        definition,
        progress,
        completedAt: assignment.completedAt,
        claimable: assignment.completedAt === null && progress.met,
      },
    ];
  };

  const ownedById = new Map(owned.map((row) => [row.cosmeticId, row]));

  const badge: ProgressBadge = {
    ...levelProgress(profile.xp),
    coins: profile.coins,
    frame:
      cosmeticDefinitions.find(
        (definition) =>
          definition.kind === IMPLEMENTED_COSMETIC_KIND &&
          ownedById.get(definition.id)?.equipped === true,
      )?.key ?? null,
    unlocked: unlockedRows(achievementDefinitions, unlocked).flatMap((row) =>
      row.unlockedAt === null
        ? []
        : [{ key: row.definition.key, name: row.definition.name, unlockedAt: row.unlockedAt }],
    ),
    weeklyGoalsClaimed: goals.filter((goal) => goal.completedAt !== null).length,
  };

  const goalRows: WeeklyGoalRow[] = goals.map((goal) => {
    const progress = questProgress(weekFacts, goal.metric, goal.target);
    return {
      id: goal.id,
      metric: goal.metric,
      target: goal.target,
      title: goal.title,
      progress,
      completedAt: goal.completedAt,
      claimable: goal.completedAt === null && progress.met,
    };
  });

  const cosmetics: CosmeticRow[] = cosmeticDefinitions.map((definition) => {
    const row = ownedById.get(definition.id);
    return {
      definition,
      owned: row !== undefined,
      equipped: row?.equipped === true,
      affordable: profile.coins >= definition.price,
    };
  });

  return {
    timezone,
    today,
    weekStart: week.start,
    badge,
    todayFacts,
    weekFacts,
    daily: assignments.filter((row) => row.period === "daily").flatMap(toQuestRow),
    weekly: assignments.filter((row) => row.period === "weekly").flatMap(toQuestRow),
    goals: goalRows,
    achievements: unlockedRows(achievementDefinitions, unlocked),
    cosmetics,
    recent,
    cappedToday: cappedSources(awardedToday),
  };
}

/** Ended sessions in the window; a live one has no measured minutes yet. */
async function focusSessionsFor(
  supabase: Awaited<ReturnType<typeof requireSession>>["supabase"],
  userId: string,
  window: { start: Instant; end: Instant },
): Promise<FocusSession[]> {
  const sessions = await focus.listStartedBetween(supabase, userId, window);
  return sessions.filter(
    (session) => session.status === "completed" || session.status === "abandoned",
  );
}

function unlockedRows(
  definitions: Awaited<ReturnType<typeof gamification.listAchievementDefinitions>>,
  unlocked: Awaited<ReturnType<typeof gamification.listUnlockedAchievements>>,
): AchievementRow[] {
  const unlockedAt = new Map(unlocked.map((row) => [row.achievementId, row.unlockedAt]));
  return definitions.map((definition) => ({
    definition,
    unlockedAt: unlockedAt.get(definition.id) ?? null,
  }));
}

/** What the caps have paid out over the ledger's rolling window. A report, never an input to an award. */
function cappedSources(
  awarded: readonly { sourceType: XpSourceType; amount: number }[],
): { source: string; awarded: number; cap: number }[] {
  const totals = new Map<XpSourceType, number>();
  for (const row of awarded) {
    totals.set(row.sourceType, (totals.get(row.sourceType) ?? 0) + row.amount);
  }

  return Object.entries(XP_DAILY_CAPS).flatMap(([source, cap]) =>
    cap === undefined
      ? []
      : [
          {
            source,
            awarded: totals.get(source as XpSourceType) ?? 0,
            cap,
          },
        ],
  );
}
