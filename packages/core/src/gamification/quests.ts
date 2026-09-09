import { diffDays, localDate, localDateOf } from "../time";
import type { IanaTimeZone, Instant, LocalDate, Minutes } from "../types/scalars";
import type { QuestMetric, QuestPeriod } from "../types/gamification";
import type { TaskPriority } from "../types/task";

/**
 * Quest selection and progress: display-side mirrors of `assign_quests()` and
 * `metric_progress()` in the gamification functions migration, pinned by
 * `packages/db/src/gamification-rules.test.ts`. Progress is never stored.
 */

/** How many quests one period assigns. */
export const QUEST_SLOTS: Record<QuestPeriod, number> = {
  /** `daily_quest_slots`. */
  daily: 3,
  /** `weekly_quest_slots`. */
  weekly: 2,
};

/**
 * The most any quest may ask for, by period and metric. Must match
 * `quest_definitions_volume_chk`, where the rule is enforced (Domain Rule 7).
 * Every metric is named; there is deliberately no fallback.
 */
export const QUEST_TARGET_CAPS: Record<QuestPeriod, Record<QuestMetric, number>> = {
  daily: {
    tasks_completed: 5,
    priority_tasks_completed: 3,
    focus_minutes: 120,
    habits_completed: 5,
    habit_days: 1,
    blocks_completed: 6,
  },
  weekly: {
    tasks_completed: 25,
    priority_tasks_completed: 10,
    focus_minutes: 360,
    habits_completed: 35,
    habit_days: 7,
    blocks_completed: 30,
  },
};

export function isHealthyQuestTarget(
  period: QuestPeriod,
  metric: QuestMetric,
  target: number,
): boolean {
  return target > 0 && target <= QUEST_TARGET_CAPS[period][metric];
}

/** The day the rotation counts from; must match the SQL. */
const ROTATION_EPOCH = localDate("1970-01-01");

/** A stable per-account offset: the last four hex digits of the uuid. A spread, not a secret. */
export function questRotationOffset(userId: string): number {
  const hex = userId.replace(/-/g, "").slice(-4);
  const value = Number.parseInt(hex, 16);
  return Number.isNaN(value) ? 0 : value;
}

/**
 * The quests a user is assigned for a period, in slot order:
 * `index = (days since the epoch + the account's offset) mod n`, then the next
 * `slots` definitions in key order, wrapping. Deterministic per (account, date).
 * `definitions` is filtered and sorted here so input order cannot change the answer.
 */
export function selectQuests<T extends { key: string; period: QuestPeriod; active: boolean }>(
  definitions: readonly T[],
  userId: string,
  period: QuestPeriod,
  periodStart: LocalDate,
): T[] {
  const pool = definitions
    .filter((definition) => definition.active && definition.period === period)
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const count = pool.length;
  if (count === 0) return [];

  const slots = Math.min(QUEST_SLOTS[period], count);
  const days = diffDays(ROTATION_EPOCH, periodStart);
  const start = (((days + questRotationOffset(userId)) % count) + count) % count;

  const chosen: T[] = [];
  for (let slot = 0; slot < slots; slot += 1) {
    // The loop bound and the modulus keep the index in range.
    chosen.push(pool[(start + slot) % count] as T);
  }
  return chosen;
}

/** Everything a quest or weekly goal can measure. `focusMinutes` includes sessions ended early, as `metric_progress()` does. */
export interface QuestFacts {
  tasksCompleted: number;
  priorityTasksCompleted: number;
  focusMinutes: number;
  habitsCompleted: number;
  habitDays: number;
  blocksCompleted: number;
}

export const EMPTY_QUEST_FACTS: QuestFacts = {
  tasksCompleted: 0,
  priorityTasksCompleted: 0,
  focusMinutes: 0,
  habitsCompleted: 0,
  habitDays: 0,
  blocksCompleted: 0,
};

export function metricValue(facts: QuestFacts, metric: QuestMetric): number {
  switch (metric) {
    case "tasks_completed":
      return facts.tasksCompleted;
    case "priority_tasks_completed":
      return facts.priorityTasksCompleted;
    case "focus_minutes":
      return facts.focusMinutes;
    case "habits_completed":
      return facts.habitsCompleted;
    case "habit_days":
      return facts.habitDays;
    case "blocks_completed":
      return facts.blocksCompleted;
  }
}

export interface QuestProgress {
  value: number;
  target: number;
  /** 0..1, clamped, so a bar cannot overflow its track. */
  fraction: number;
  met: boolean;
}

export function questProgress(
  facts: QuestFacts,
  metric: QuestMetric,
  target: number,
): QuestProgress {
  const value = Math.max(0, metricValue(facts, metric));
  const denominator = Math.max(1, target);
  return {
    value,
    target,
    fraction: Math.min(1, value / denominator),
    met: value >= target,
  };
}

/** The rows a period's facts are counted from; structural, so an optimistic overlay satisfies it too. */
export interface QuestFactSources {
  completedTasks: readonly { completedAt: Instant | null; priority: TaskPriority }[];
  /** Ended sessions. An abandoned one counts its minutes. */
  focusSessions: readonly { startedAt: Instant; actualMinutes: Minutes | null }[];
  habitCompletions: readonly { completionDate: LocalDate }[];
  completedBlocks: readonly { completedAt: Instant | null }[];
}

/**
 * Count a period's facts in the user's timezone. `dates` is the set of local
 * dates the period covers; instants are bucketed with `localDateOf`, matching
 * `metric_progress()`'s `at time zone` in SQL.
 */
export function questFactsFor(
  sources: QuestFactSources,
  timezone: IanaTimeZone,
  dates: readonly LocalDate[],
): QuestFacts {
  const within = new Set<string>(dates);
  const inPeriod = (at: Instant | null): boolean =>
    at !== null && within.has(localDateOf(at, timezone));

  const tasks = sources.completedTasks.filter((task) => inPeriod(task.completedAt));
  const sessions = sources.focusSessions.filter((session) => inPeriod(session.startedAt));
  const completions = sources.habitCompletions.filter((row) => within.has(row.completionDate));

  return {
    tasksCompleted: tasks.length,
    priorityTasksCompleted: tasks.filter((task) => task.priority === 1).length,
    focusMinutes: sessions.reduce((total, session) => total + (session.actualMinutes ?? 0), 0),
    habitsCompleted: completions.length,
    habitDays: new Set(completions.map((row) => row.completionDate)).size,
    blocksCompleted: sources.completedBlocks.filter((block) => inPeriod(block.completedAt)).length,
  };
}
