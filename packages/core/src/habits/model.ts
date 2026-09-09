import { weekdayOf } from "../time";
import type { Habit, HabitFrequencyType, LocalDate, Minutes } from "../types";

/**
 * The shape of a habit's target, and the questions every other file here asks
 * of it. Nothing in this module reads a clock, a timezone or a database row:
 * a habit plus a list of `(date, amount)` pairs is the whole input, and "today"
 * always arrives as a parameter (Domain Rules 4, 5).
 *
 * Five frequency types, two cadences. The cadence is the period the target is
 * measured over, and it is the only distinction the maths below cares about:
 *
 *   per-day    daily · weekdays · amount_per_day
 *   per-week   times_per_week · amount_per_week
 *
 * Habits deliberately do not use the recurrence model (docs/ARCHITECTURE.md
 * §11). A habit's schedule is `activeDays` plus a target, and "Add to week"
 * writes real blocks for one week — there is no series row, no expansion and
 * no override. This module is that schedule.
 */

/** Which period a habit's target is measured over. */
export type HabitCadence = "per-day" | "per-week";

export function cadenceOf(frequencyType: HabitFrequencyType): HabitCadence {
  return frequencyType === "times_per_week" || frequencyType === "amount_per_week"
    ? "per-week"
    : "per-day";
}

/**
 * True when the target is an accumulating quantity (minutes, problems, pages)
 * rather than a tick.
 *
 * `daily`, `weekdays` and `times_per_week` are boolean habits: the day either
 * happened or it did not, and a second completion on the same day is a no-op
 * (Domain Rule 14). The two `amount_*` types add to the day's `amount`.
 */
export function isAmountHabit(frequencyType: HabitFrequencyType): boolean {
  return frequencyType === "amount_per_day" || frequencyType === "amount_per_week";
}

/**
 * The habit expects work on this specific date.
 *
 * Only the per-day cadence can answer yes. "Three times a week, any days" names
 * no day at all, and treating an arbitrary one as due would invent a schedule
 * the user did not ask for — and would then let the product tell them they
 * missed a day they never chose (Domain Rule 7).
 */
export function isScheduledOn(habit: HabitSchedule, date: LocalDate): boolean {
  switch (habit.frequencyType) {
    case "daily":
    case "amount_per_day":
      return true;
    case "weekdays":
      return habit.activeDays.includes(weekdayOf(date));
    case "times_per_week":
    case "amount_per_week":
      return false;
  }
}

/** The part of a `Habit` this module needs. Keeps the maths usable from a form draft. */
export type HabitSchedule = Pick<
  Habit,
  "frequencyType" | "target" | "unit" | "activeDays" | "estimatedMinutes" | "preferredStartTime"
>;

/**
 * What one day of a per-day habit has to reach: one tick, or the amount.
 * Meaningless for the per-week cadence, which is why it returns null there
 * rather than a number a caller could accidentally compare against.
 */
export function dailyTargetOf(habit: HabitSchedule): number | null {
  switch (habit.frequencyType) {
    case "daily":
    case "weekdays":
      return 1;
    case "amount_per_day":
      return habit.target;
    case "times_per_week":
    case "amount_per_week":
      return null;
  }
}

/** What one week has to reach, for the cadence that measures weeks. */
export function weeklyTargetOf(habit: HabitSchedule): number | null {
  return cadenceOf(habit.frequencyType) === "per-week" ? habit.target : null;
}

/**
 * How much a day's recorded amount contributes toward the habit's target.
 *
 * For an amount habit that is the amount itself. For a boolean habit it is one
 * per *day*, whatever the row says: `record_habit_completion` forces `amount`
 * to 1 for those types, and a row that somehow carried more must not be able to
 * count as two days of a `times_per_week` target. A day with nothing recorded
 * contributes nothing, in both cases.
 */
export function contributionOf(habit: HabitSchedule, amount: number): number {
  if (amount <= 0) return 0;
  return isAmountHabit(habit.frequencyType) ? amount : 1;
}

/** A completion, reduced to what the maths reads. Any `HabitCompletion` satisfies it. */
export interface HabitCompletionLike {
  completionDate: LocalDate;
  amount: number;
}

/**
 * `date → amount`, summed.
 *
 * The database allows exactly one row per habit per date (Domain Rule 14), so
 * this is a lookup and not really a sum — but it is written as one so that an
 * optimistic overlay holding a not-yet-persisted row beside a persisted one
 * produces the number the server will produce, rather than silently dropping
 * one of them.
 */
export function amountsByDate(completions: readonly HabitCompletionLike[]): Map<LocalDate, number> {
  const byDate = new Map<LocalDate, number>();
  for (const completion of completions) {
    const current = byDate.get(completion.completionDate) ?? 0;
    byDate.set(completion.completionDate, current + completion.amount);
  }
  return byDate;
}

/** Minutes a generated habit block runs for when the habit declares no estimate. */
export const DEFAULT_HABIT_BLOCK_MINUTES: Minutes = 30;

/** Where a generated habit block starts when the habit declares no preferred time. */
export const DEFAULT_HABIT_START_MINUTES: Minutes = 8 * 60;
