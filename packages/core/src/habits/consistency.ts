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
 * Consistency, not streaks (Domain Rule 7). One rule governs every rate here:
 * a period that has not finished (today, the week in progress) is excluded
 * from the denominator unless it has already been met. Nothing before
 * `trackedFrom` is expected of a habit.
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
  /** Today in the user's timezone. */
  today: LocalDate;
  /** The user's week-start preference. */
  weekStart: Weekday;
  /** The habit's first tracked date; nothing before it is expected of it. */
  trackedFrom: LocalDate;
}

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

/** The rate over an explicit window; every number above is built from it. */
export function rateOver(input: HabitStatsInput, window: HabitWindow): HabitRate {
  return cadenceOf(input.habit.frequencyType) === "per-week"
    ? weeklyRate(input, window)
    : dailyRate(input, window);
}

function dailyRate(input: HabitStatsInput, window: HabitWindow): HabitRate {
  const { habit, today, trackedFrom } = input;
  const amounts = amountsByDate(input.completions);
  const target = dailyTargetOf(habit) ?? 1;

  let met = 0;
  let expected = 0;

  for (const date of datesIn(window, trackedFrom, today)) {
    if (!isScheduledOn(habit, date)) continue;

    const reached = (amounts.get(date) ?? 0) >= target;
    // Today is not over: it counts only once met.
    if (date >= today && !reached) continue;

    expected += 1;
    if (reached) met += 1;
  }

  return toRate(met, expected);
}

/**
 * A week that began before the habit did is skipped rather than pro-rated, so
 * a habit younger than one week reports `value: null`. The week in progress
 * counts only once the target is reached.
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

export interface HabitStreaks {
  best: number;
  current: number;
}

/** Consecutive met periods over the whole tracked history. The unfinished period at the end never breaks a streak. */
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

/** Every date in the window, clipped to the habit's tracked history and to today. */
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

/** The first day of `date`'s month. String surgery, so no `Date` round trip. */
function startOfMonth(date: LocalDate): LocalDate {
  return `${date.slice(0, 7)}-01` as LocalDate;
}

function toRate(met: number, expected: number): HabitRate {
  return { met, expected, value: expected === 0 ? null : met / expected };
}
