import type { LocalDate } from "../types";
import {
  amountsByDate,
  cadenceOf,
  contributionOf,
  dailyTargetOf,
  isAmountHabit,
  isScheduledOn,
  type HabitCompletionLike,
  type HabitSchedule,
} from "./model";

/**
 * A habit's week, resolved for display. There is deliberately no "missed" or
 * "failed" state (Domain Rule 7): state names leak into every label.
 *
 *   met       the day's target was reached
 *   partial   an amount habit recorded something, short of the day's target
 *   open      a scheduled day, now past, with nothing recorded
 *   ahead     a scheduled day that has not arrived yet (today counts as ahead
 *             until something is recorded — the day is not over)
 *   free      the habit asks nothing of this day
 */
export type HabitDayState = "met" | "partial" | "open" | "ahead" | "free";

export interface HabitDay {
  date: LocalDate;
  state: HabitDayState;
  /** What was recorded. Minutes or a count for amount habits, 0 or 1 otherwise. */
  amount: number;
  /** What the day asked for, or null when the habit names no per-day target. */
  target: number | null;
}

/** One day's state. A per-week habit's days are `free` until something is recorded, then `met`. */
export function habitDay(
  habit: HabitSchedule,
  date: LocalDate,
  amount: number,
  today: LocalDate,
): HabitDay {
  const target = dailyTargetOf(habit);

  if (target === null) {
    return { date, amount, target: null, state: amount > 0 ? "met" : "free" };
  }

  if (!isScheduledOn(habit, date)) {
    return { date, amount, target, state: amount > 0 ? "met" : "free" };
  }

  if (amount >= target) return { date, amount, target, state: "met" };
  if (amount > 0) return { date, amount, target, state: date > today ? "ahead" : "partial" };
  return { date, amount, target, state: date >= today ? "ahead" : "open" };
}

/** Seven (or however many) days of one habit, in the order given. */
export function habitDays(
  habit: HabitSchedule,
  dates: readonly LocalDate[],
  completions: readonly HabitCompletionLike[],
  today: LocalDate,
): HabitDay[] {
  const amounts = amountsByDate(completions);
  return dates.map((date) => habitDay(habit, date, amounts.get(date) ?? 0, today));
}

/** Progress toward the target over a set of dates. `achieved` is uncapped; `fraction` is capped at 1. */
export interface HabitProgress {
  achieved: number;
  target: number;
  fraction: number;
}

export function weekProgress(
  habit: HabitSchedule,
  dates: readonly LocalDate[],
  completions: readonly HabitCompletionLike[],
): HabitProgress {
  const amounts = amountsByDate(completions);

  if (cadenceOf(habit.frequencyType) === "per-week") {
    let achieved = 0;
    for (const date of dates) achieved += contributionOf(habit, amounts.get(date) ?? 0);
    return withFraction(achieved, habit.target);
  }

  const perDay = dailyTargetOf(habit) ?? 1;
  let achieved = 0;
  let target = 0;
  for (const date of dates) {
    if (!isScheduledOn(habit, date)) continue;
    target += perDay;
    achieved += Math.min(amounts.get(date) ?? 0, perDay);
  }
  return withFraction(achieved, target);
}

function withFraction(achieved: number, target: number): HabitProgress {
  return {
    achieved,
    target,
    fraction: target <= 0 ? 0 : Math.min(1, achieved / target),
  };
}

/**
 * What one press on a habit's control records. A boolean habit records 1; an
 * amount habit is topped up to the rest of today's target (or the week's, for
 * a per-week habit). Never less than 1. Both the habits page and Today call this.
 */
export function amountToRecord(
  habit: HabitSchedule,
  day: Pick<HabitDay, "amount" | "target">,
  week: Pick<HabitProgress, "achieved" | "target">,
): number {
  if (!isAmountHabit(habit.frequencyType)) return 1;
  const remaining = day.target === null ? week.target - week.achieved : day.target - day.amount;
  return Math.max(1, remaining);
}
