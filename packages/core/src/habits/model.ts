import { weekdayOf } from "../time";
import type { Habit, HabitFrequencyType, LocalDate, Minutes } from "../types";

/**
 * A habit's schedule. Five frequency types, two cadences:
 *   per-day    daily · weekdays · amount_per_day
 *   per-week   times_per_week · amount_per_week
 */

/** Which period a habit's target is measured over. */
export type HabitCadence = "per-day" | "per-week";

export function cadenceOf(frequencyType: HabitFrequencyType): HabitCadence {
  return frequencyType === "times_per_week" || frequencyType === "amount_per_week"
    ? "per-week"
    : "per-day";
}

/** True when the target is an accumulating quantity rather than a tick; a boolean habit's second completion on a day is a no-op. */
export function isAmountHabit(frequencyType: HabitFrequencyType): boolean {
  return frequencyType === "amount_per_day" || frequencyType === "amount_per_week";
}

/** The habit expects work on this date. Only the per-day cadence can answer yes: a per-week habit names no day. */
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

/** What one day of a per-day habit has to reach; null for the per-week cadence. */
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
 * How much a day's recorded amount contributes toward the target: the amount
 * for an amount habit, one per day for a boolean habit whatever the row says.
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

/** `date → amount`, summed so an optimistic row beside a persisted one gives the server's number. */
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
