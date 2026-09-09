import "server-only";

import {
  allPeriods,
  summariseAnalytics,
  WIDEST_RANGE,
  type AnalyticsRange,
  type AnalyticsSummary,
  type CompletedTaskFact,
  type FocusSessionFact,
  type HabitCompletionFact,
  type HabitFact,
  type WorkBlockFact,
} from "@momentum/core/analytics";
import { localDateOf, nowInstant, todayIn } from "@momentum/core/time";
import type { Habit, IanaTimeZone } from "@momentum/core/types";
import { blocks, focus, habits as habitsRepo, projects as projectsRepo, tasks } from "@momentum/db";

import type { AnalyticsPageData, AnalyticsProject } from "@/features/analytics/types";
import { requireSession } from "@/lib/auth/session";

/**
 * Reads ninety days once; the narrower ranges are computed from the same rows
 * in `@momentum/core/analytics`, so switching range costs no fetch and the
 * totals cannot disagree. Every boundary resolves in the profile's timezone.
 */
export async function getAnalyticsPage(): Promise<AnalyticsPageData> {
  const { supabase, userId, profile } = await requireSession();
  const timezone = profile.timezone;

  const today = todayIn(timezone, nowInstant());
  const periods = allPeriods(today, timezone);
  const widest = periods[WIDEST_RANGE];

  const [sessionRows, taskRows, blockRows, habitRows, completionRows, projectRows] =
    await Promise.all([
      focus.listStartedBetween(supabase, userId, widest.window),
      tasks.listCompletedBetween(supabase, userId, widest.window),
      blocks.listWorkBetween(supabase, userId, widest.window),
      // Archived habits included: `habitConsistencyByDay` uses `archivedFrom` to
      // stop expecting anything of them after it.
      habitsRepo.listFor(supabase, userId),
      habitsRepo.listCompletionsBetween(supabase, userId, widest.from, widest.to),
      projectsRepo.listFor(supabase, userId),
    ]);

  const focusSessions: FocusSessionFact[] = sessionRows.map((session) => ({
    startedAt: session.startedAt,
    actualMinutes: session.actualMinutes,
    projectId: session.projectId,
  }));

  // Subtasks are counted: each earns its own XP, and this keeps "tasks
  // completed" agreeing with the quest counter.
  const completedTasks: CompletedTaskFact[] = taskRows.map((task) => ({
    id: task.id,
    projectId: task.projectId,
    completedAt: task.completedAt,
    estimatedMinutes: task.estimatedMinutes,
    actualMinutes: task.actualMinutes,
  }));

  const workBlocks: WorkBlockFact[] = blockRows.map((block) => ({
    startAt: block.startAt,
    endAt: block.endAt,
    completedAt: block.completedAt,
  }));

  const habits: HabitFact[] = habitRows.map((habit) => habitFact(habit, timezone));

  const habitCompletions: HabitCompletionFact[] = completionRows.map((row) => ({
    habitId: row.habitId,
    completionDate: row.completionDate,
    amount: row.amount,
  }));

  const projects: AnalyticsProject[] = [
    ...projectRows.map((project) => ({
      id: project.id,
      name: project.name,
      color: project.color,
    })),
    { id: null, name: "No project", color: "slate" as const },
  ];

  const summarise = (range: AnalyticsRange): AnalyticsSummary =>
    summariseAnalytics({
      period: periods[range],
      timezone,
      focusSessions,
      completedTasks,
      workBlocks,
      habits,
      habitCompletions,
      projects: projectRows.map((project) => ({ id: project.id, name: project.name })),
    });

  const ranges: Record<AnalyticsRange, AnalyticsSummary> = {
    "7": summarise("7"),
    "30": summarise("30"),
    "90": summarise("90"),
  };

  return {
    timezone,
    today,
    weekStart: profile.weekStart,
    projects,
    ranges,
    hasNoHistory: ranges[WIDEST_RANGE].isEmpty,
  };
}

/**
 * A habit's answerable span, in local dates. Archiving takes effect from its
 * own date onward, so the day a habit was retired asks nothing of it.
 */
function habitFact(habit: Habit, timezone: IanaTimeZone): HabitFact {
  return {
    id: habit.id,
    habit: {
      frequencyType: habit.frequencyType,
      target: habit.target,
      unit: habit.unit,
      activeDays: habit.activeDays,
      estimatedMinutes: habit.estimatedMinutes,
      preferredStartTime: habit.preferredStartTime,
    },
    trackedFrom: localDateOf(habit.createdAt, timezone),
    archivedFrom: habit.archivedAt === null ? null : localDateOf(habit.archivedAt, timezone),
  };
}
