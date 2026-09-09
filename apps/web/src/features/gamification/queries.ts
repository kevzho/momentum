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

/**
 * The two reads the progression surface needs.
 *
 * `getProgressBadge()` runs on every authenticated request, because the top bar
 * is on every route. It is three small indexed reads and no arithmetic beyond
 * the level curve.
 *
 * `getProgressPage()` is the /progress route's one read. The week's rows are
 * fetched once and counted twice — today and this week — in
 * `@momentum/core/gamification`, so the daily and weekly numbers can never
 * disagree about the same completion, and every date boundary is resolved in
 * the profile timezone (Domain Rules 4, 5).
 *
 * Nothing here computes an award. Progress is derived from source rows for
 * display; a claim is checked again in SQL against the same rows, and it is
 * that second check that decides (Domain Rule 6).
 */

/** How many ledger rows the history panel shows. */
export const XP_HISTORY_LIMIT = 12;

export async function getProgressBadge(): Promise<ProgressBadge> {
  const { supabase, userId, profile } = await requireSession();

  const now = nowInstant();
  const today = todayIn(profile.timezone, now);
  const week = weekOf(today, profile.weekStart);

  // Three small indexed reads, on every authenticated route, because the
  // indicator and the celebration are on every authenticated route. The
  // achievements one joins its definitions rather than fetching them
  // separately; all three are tables of at most a handful of rows per user.
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

  // The week, as instants. `startOfDay` knows that the local days either side
  // of a DST transition are 23 or 25 hours long.
  const weekWindow = {
    start: startOfDay(week.start, timezone),
    end: startOfDay(addDays(week.start, 7), timezone),
  };
  // The caps panel measures the window the ledger's trigger measures — the
  // last 24 hours, rolling — not the local day (Domain Rules §21). A local day
  // would read "0 of 200" just after midnight while the trigger still counted
  // yesterday evening's awards.
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
    // Assigning is idempotent and resolves the period from the profile itself,
    // so the page can simply ask for "the current quests" (Domain Rule 17).
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

/**
 * Ended sessions in the window.
 *
 * `listStartedBetween` returns every session that began in the window; a live
 * one has no measured minutes yet and contributes nothing, so it is filtered
 * here rather than counted as zero and left in the list.
 */
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

/**
 * What the caps have paid out in the last 24 hours.
 *
 * Stated rather than hidden, for the reason the focus page states its own: a
 * user who has hit a cap should be told the rule, not left to notice that a
 * completion moved nothing. It is a report of the ledger and never an input to
 * an award (Domain Rule 6), measured over the ledger's own rolling window.
 */
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
