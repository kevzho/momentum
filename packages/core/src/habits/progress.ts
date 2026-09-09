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
 * A habit's week, resolved for display: one state per day, plus the week's own
 * progress toward whatever the habit's target is.
 *
 * The vocabulary is chosen as carefully as the maths. There is no "missed" and
 * no "failed" state anywhere in this module: a scheduled day that has passed
 * without a completion is **`open`**, and a day still ahead is **`ahead`**.
 * Domain Rule 7 rules out language that characterises the user, and a state
 * name leaks into every label, tooltip and screen-reader string that renders
 * it — so the neutral word has to be the one the type offers.
 */

/**
 * What one day looks like.
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

/**
 * One day's state.
 *
 * A per-week habit ("three times a week, any days") asks nothing of a specific
 * date, so its days are `free` until something is recorded on them and `met`
 * after — the day contributed to the week, and there is no sense in which a
 * Tuesday it did not name was skipped.
 */
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

/**
 * How far through its target the habit is over a set of dates — the number the
 * card shows as "2 of 3" or "80 of 120 minutes".
 *
 * `achieved` is uncapped so that doing more than the target is visible as more;
 * `fraction` is capped at 1 so a progress bar cannot overflow its track.
 */
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
 * What one press on a habit's control records for a day.
 *
 * A boolean habit records the day, and nothing else: `record_habit_completion`
 * forces its amount to 1 whatever is sent. An amount habit is *topped up to its
 * target* in one press — the rest of today's target for a per-day habit, and
 * the rest of the week's for a per-week one, which names no per-day target at
 * all (`dailyTargetOf` is null there). Sending 1 toward a two-hour week would
 * record one minute and still call the day done, and the week's rate would then
 * be computed from one-minute days.
 *
 * Never less than 1: a day already past its target still records something
 * rather than nothing, which is what the press asked for.
 *
 * Both surfaces that offer the press — the habits page and Today — call this,
 * so they cannot disagree on what a tap means.
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
