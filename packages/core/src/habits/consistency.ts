import { addDays, diffDays, weekOf } from "../time";
import type { LocalDate, Weekday } from "../types";
import {
  amountsByDate,
  cadenceOf,
  contributionOf,
  dailyTargetOf,
  isScheduledOn,
  type HabitCompletionLike,
  type HabitSchedule,
} from "./model";

/**
 * Consistency, not streaks (Domain Rule 7).
 *
 * A missed day lowers a rate. It deletes nothing, resets nothing to zero, and
 * costs no XP. The best streak is computed here because it is a fact worth
 * showing; nothing in the product is allowed to make it the thing the user is
 * afraid of losing, which is why `currentStreak` is reported beside it rather
 * than instead of it.
 *
 * **One rule governs every rate in this file: a period that has not finished is
 * excluded from the denominator unless it has already been met.** Today, and
 * the week in progress, cannot pull a rate down — there is still time. Once
 * met, they count, so the number moves the moment the user earns it. That rule
 * is what makes "consistency" a description of what happened rather than a
 * running judgement of what has not happened yet.
 *
 * `trackedFrom` is the habit's own start (its creation date in the user's
 * timezone). A habit created on Thursday is not 0% for the Monday it did not
 * exist on.
 */

/** Met over expected. `value` is null when the window contains nothing to measure. */
export interface HabitRate {
  met: number;
  expected: number;
  /** 0..1, or null when `expected` is 0 — "no data" is not "0%". */
  value: number | null;
}

export interface HabitWindow {
  /** Inclusive first date. */
  from: LocalDate;
  /** Inclusive last date. */
  to: LocalDate;
}

export interface HabitStatsInput {
  habit: HabitSchedule;
  completions: readonly HabitCompletionLike[];
  /** Today in the user's timezone (Domain Rule 4). */
  today: LocalDate;
  /** The user's week-start preference (Domain Rule 4). */
  weekStart: Weekday;
  /** The habit's first tracked date; nothing before it is expected of it. */
  trackedFrom: LocalDate;
}

/** The four numbers the habits surface shows (specs/06-habits.md). */
export interface HabitStats {
  /** The headline rate: a rolling 30 days. */
  consistency: HabitRate;
  /** The current calendar week so far, in the user's own week shape. */
  weekly: HabitRate;
  /** The current calendar month so far. */
  monthly: HabitRate;
  bestStreak: number;
  currentStreak: number;
  /** What a streak counts, so a label can say "5 weeks" rather than "5". */
  streakUnit: "day" | "week";
}

/** The rolling window the headline consistency is measured over. */
export const CONSISTENCY_WINDOW_DAYS = 30;

export function habitStats(input: HabitStatsInput): HabitStats {
  const { habit, today, weekStart } = input;
  const streaks = habitStreaks(input);

  return {
    consistency: rateOver(input, {
      from: addDays(today, -(CONSISTENCY_WINDOW_DAYS - 1)),
      to: today,
    }),
    weekly: rateOver(input, { from: weekOf(today, weekStart).start, to: today }),
    monthly: rateOver(input, { from: startOfMonth(today), to: today }),
    bestStreak: streaks.best,
    currentStreak: streaks.current,
    streakUnit: cadenceOf(habit.frequencyType) === "per-week" ? "week" : "day",
  };
}

/**
 * The rate over an explicit window — the one function every number above is
 * built from, so "weekly" and "monthly" cannot come to mean different things.
 */
export function rateOver(input: HabitStatsInput, window: HabitWindow): HabitRate {
  return cadenceOf(input.habit.frequencyType) === "per-week"
    ? weeklyRate(input, window)
    : dailyRate(input, window);
}

/* -------------------------------------------------------------------------- */
/* Per-day cadence                                                            */
/* -------------------------------------------------------------------------- */

function dailyRate(input: HabitStatsInput, window: HabitWindow): HabitRate {
  const { habit, today, trackedFrom } = input;
  const amounts = amountsByDate(input.completions);
  const target = dailyTargetOf(habit) ?? 1;

  let met = 0;
  let expected = 0;

  for (const date of datesIn(window, trackedFrom, today)) {
    if (!isScheduledOn(habit, date)) continue;

    const reached = (amounts.get(date) ?? 0) >= target;
    // Today is not over. It counts only once it has been met, so an unfinished
    // day can raise the rate but never lower it.
    if (date >= today && !reached) continue;

    expected += 1;
    if (reached) met += 1;
  }

  return toRate(met, expected);
}

/* -------------------------------------------------------------------------- */
/* Per-week cadence                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Weeks, in the user's own week shape.
 *
 * A week that began before the habit did is skipped entirely rather than
 * pro-rated: "three times a week" said nothing about the three days of that
 * week the habit was not yet being tracked, and inventing a smaller target for
 * it would be inventing data. A habit younger than one week therefore reports
 * no rate at all — which `HabitRate.value === null` says honestly, instead of
 * showing 0%.
 *
 * The week in progress follows the same rule as today: it counts only once the
 * target is reached.
 */
function weeklyRate(input: HabitStatsInput, window: HabitWindow): HabitRate {
  const { habit, today, weekStart, trackedFrom } = input;
  const amounts = amountsByDate(input.completions);
  const target = habit.target;

  let met = 0;
  let expected = 0;

  const currentWeekStart = weekOf(today, weekStart).start;

  for (const start of weekStartsIn(window, weekStart)) {
    if (start < trackedFrom) continue;
    if (start > currentWeekStart) continue;

    const achieved = achievedInWeek(habit, amounts, start);
    const reached = achieved >= target;

    if (start >= currentWeekStart && !reached) continue;

    expected += target;
    met += Math.min(achieved, target);
  }

  return toRate(met, expected);
}

function achievedInWeek(
  habit: HabitSchedule,
  amounts: ReadonlyMap<LocalDate, number>,
  weekStartDate: LocalDate,
): number {
  let achieved = 0;
  for (let i = 0; i < 7; i += 1) {
    achieved += contributionOf(habit, amounts.get(addDays(weekStartDate, i)) ?? 0);
  }
  return achieved;
}

/* -------------------------------------------------------------------------- */
/* Streaks                                                                    */
/* -------------------------------------------------------------------------- */

export interface HabitStreaks {
  best: number;
  current: number;
}

/**
 * Consecutive met periods, counted over the habit's whole tracked history.
 *
 * The unfinished period at the end — today, or the week in progress — never
 * breaks a streak. It extends one when it has been met and is otherwise
 * skipped, so a streak of nine days is still nine at breakfast and ten by
 * bedtime, and never nine-then-zero-then-ten.
 */
export function habitStreaks(input: HabitStatsInput): HabitStreaks {
  const { habit, today, weekStart, trackedFrom } = input;
  const amounts = amountsByDate(input.completions);

  let best = 0;
  let current = 0;

  if (cadenceOf(habit.frequencyType) === "per-week") {
    const first = weekOf(trackedFrom, weekStart).start;
    const last = weekOf(today, weekStart).start;
    // A week that began before the habit did is not a week it could have met.
    const start = first < trackedFrom ? addDays(first, 7) : first;

    for (let week = start; week <= last; week = addDays(week, 7)) {
      const reached = achievedInWeek(habit, amounts, week) >= habit.target;
      if (reached) {
        current += 1;
        best = Math.max(best, current);
      } else if (week < last) {
        current = 0;
      }
    }
    return { best, current };
  }

  const target = dailyTargetOf(habit) ?? 1;
  for (let date = trackedFrom; date <= today; date = addDays(date, 1)) {
    if (!isScheduledOn(habit, date)) continue;
    if ((amounts.get(date) ?? 0) >= target) {
      current += 1;
      best = Math.max(best, current);
    } else if (date < today) {
      current = 0;
    }
  }
  return { best, current };
}

/* -------------------------------------------------------------------------- */
/* Window helpers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Every date in the window, clipped to the habit's tracked history and to
 * today — dates the habit did not exist for and dates that have not happened
 * are not evidence of anything.
 */
function datesIn(window: HabitWindow, trackedFrom: LocalDate, today: LocalDate): LocalDate[] {
  const from = window.from < trackedFrom ? trackedFrom : window.from;
  const to = window.to > today ? today : window.to;
  const span = diffDays(from, to);

  const dates: LocalDate[] = [];
  for (let i = 0; i <= span; i += 1) dates.push(addDays(from, i));
  return dates;
}

/** The start date of every week the window touches, in the user's week shape. */
function weekStartsIn(window: HabitWindow, weekStart: Weekday): LocalDate[] {
  const first = weekOf(window.from, weekStart).start;
  const last = weekOf(window.to, weekStart).start;

  const starts: LocalDate[] = [];
  for (let week = first; week <= last; week = addDays(week, 7)) starts.push(week);
  return starts;
}

/**
 * The first day of `date`'s month.
 *
 * String surgery on a `YYYY-MM-DD`, not date arithmetic: the first of the month
 * is a fact about the string, and parsing it into a `Date` to read it back out
 * is exactly the round trip Domain Rule 4 warns about.
 */
function startOfMonth(date: LocalDate): LocalDate {
  return `${date.slice(0, 7)}-01` as LocalDate;
}

function toRate(met: number, expected: number): HabitRate {
  return { met, expected, value: expected === 0 ? null : met / expected };
}
