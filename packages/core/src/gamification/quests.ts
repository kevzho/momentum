import { diffDays, localDate, localDateOf } from "../time";
import type { IanaTimeZone, Instant, LocalDate, Minutes } from "../types/scalars";
import type { QuestMetric, QuestPeriod } from "../types/gamification";
import type { TaskPriority } from "../types/task";

/**
 * Quest selection and quest progress.
 *
 * Two rules live here, both mirrors of SQL
 * (`20260907140000_gamification_functions.sql`), both pinned to it by
 * `packages/db/src/gamification-rules.test.ts`:
 *
 * **Which quests a user gets.** `assign_quests()` writes the rows; this module
 * says what it will write, which is what lets the determinism be proved without
 * a database and lets a surface preview a day it has not reached yet.
 *
 * **How far through one is.** Progress is never stored — it is recomputed from
 * tasks, focus sessions, habit completions and blocks every time it is looked
 * at, in SQL for claiming and here for display (docs/DATABASE.md). Both read
 * the same facts over the same period, so the number under the bar and the
 * number the server checks a claim against cannot disagree.
 */

/** How many quests one period assigns. Three daily is inside the spec's "3–4". */
export const QUEST_SLOTS: Record<QuestPeriod, number> = {
  /** `daily_quest_slots`. */
  daily: 3,
  /** `weekly_quest_slots`. */
  weekly: 2,
};

/**
 * The most any quest may ever ask for, by period and metric.
 *
 * A mirror of `quest_definitions_volume_chk`, which is where the rule is
 * actually enforced — a target above these is rejected by the database, not by
 * a component. Domain Rule 7: quests never encourage unhealthy volumes of work,
 * so "focus for eight hours" is not a quest this product is capable of storing.
 *
 * Every metric is named. There is no fallback, because a metric nobody has
 * decided a healthy amount of is a metric no quest should exist for.
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

/** The day the rotation counts from. Any fixed date would do; this one is legible. */
const ROTATION_EPOCH = localDate("1970-01-01");

/**
 * A stable per-account offset, so two people who start on the same day are not
 * handed the same three quests.
 *
 * The last four hex digits of the account's uuid. A spread, not a secret —
 * nothing depends on it being unguessable, and using the whole id would need a
 * hash function shipped to the browser for no gain.
 */
export function questRotationOffset(userId: string): number {
  const hex = userId.replace(/-/g, "").slice(-4);
  const value = Number.parseInt(hex, 16);
  return Number.isNaN(value) ? 0 : value;
}

/**
 * The quests a user is assigned for a period, in slot order.
 *
 * A rotation rather than a hash:
 *
 * ```
 * index = (days since the epoch + the account's offset) mod n
 * ```
 *
 * then the next `slots` definitions in key order, wrapping. Deterministic per
 * (account, date) — the same user on the same day always gets the same list,
 * which is the acceptance criterion — and it moves the set on day to day
 * instead of pinning one account to one arbitrary ordering for ever.
 *
 * `definitions` is filtered and sorted here rather than by the caller so that
 * an unsorted list, or one carrying another period's rows, cannot change the
 * answer.
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
    // `pool` is non-empty and the index is in range, which the loop bound and
    // the modulus together guarantee.
    chosen.push(pool[(start + slot) % count] as T);
  }
  return chosen;
}

/**
 * Everything a quest or a weekly goal can measure, counted once for a period.
 *
 * The read that produces these counts the same rows `metric_progress()` counts
 * in SQL. `focusMinutes` includes sessions the user ended early, because the
 * minutes happened (Domain Rules 3, 7) — only the XP distinguishes the two
 * endings.
 */
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

/**
 * The rows a period's facts are counted from.
 *
 * Deliberately structural rather than the domain entities: this function is
 * called with tasks, sessions, completions and blocks that a query already
 * read, and narrowing the input to the four fields it actually reads keeps it
 * usable from an optimistic overlay too.
 */
export interface QuestFactSources {
  completedTasks: readonly { completedAt: Instant | null; priority: TaskPriority }[];
  /** Ended sessions. An abandoned one counts its minutes (Domain Rules 3, 7). */
  focusSessions: readonly { startedAt: Instant; actualMinutes: Minutes | null }[];
  habitCompletions: readonly { completionDate: LocalDate }[];
  completedBlocks: readonly { completedAt: Instant | null }[];
}

/**
 * Count a period's facts, in the user's own timezone.
 *
 * `dates` is the set of local dates the period covers — one for a day, seven
 * for a week — so the caller resolves the period once and this function does
 * no week arithmetic of its own. Every instant is bucketed with `localDateOf`,
 * which is the same question `metric_progress()` asks in SQL with `at time
 * zone` (Domain Rule 4): a task completed at 23:40 belongs to the day the user
 * was living in, not to the UTC date.
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
