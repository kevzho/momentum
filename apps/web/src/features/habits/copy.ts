import { isAmountHabit, type HabitDayState, type HabitRate } from "@momentum/core/habits";
import { formatDuration } from "@momentum/core/time";
import type { Habit, HabitAmountUnit, HabitFrequencyType, Weekday } from "@momentum/core/types";

import { WEEKDAY_NAMES } from "@/features/settings/weekday-names";

/**
 * Every user-facing string of the habits surface, in one tested module: nothing
 * here may call the user inconsistent or behind, describe a day as a failure,
 * or frame a number as something to lose. Components import from here rather
 * than inventing phrases the test cannot see.
 */

export const FREQUENCY_LABELS: Record<HabitFrequencyType, string> = {
  daily: "Every day",
  weekdays: "Certain days",
  times_per_week: "Days per week",
  amount_per_day: "An amount each day",
  amount_per_week: "An amount each week",
};

export const FREQUENCY_HINTS: Record<HabitFrequencyType, string> = {
  daily: "Read 20 minutes, every day.",
  weekdays: "Practise piano on Monday, Wednesday and Friday.",
  times_per_week: "Exercise three times a week, on any days.",
  amount_per_day: "Meditate 15 minutes a day.",
  amount_per_week: "Five problems a week, in any number of sittings.",
};

export const UNIT_LABELS: Record<HabitAmountUnit, string> = {
  count: "times",
  minutes: "minutes",
};

/**
 * "Every day · 25m", "Mon · Wed · Fri", "3 days a week", "15m a day". The
 * estimate is appended, not merged: reserved time and target are different facts.
 */
export function describeTarget(habit: Habit): string {
  const target = targetPhrase(habit);
  if (habit.estimatedMinutes === null) return target;
  return `${target} · ${formatDuration(habit.estimatedMinutes)} a session`;
}

function targetPhrase(habit: Habit): string {
  switch (habit.frequencyType) {
    case "daily":
      return "Every day";
    case "weekdays":
      return describeDays(habit.activeDays);
    case "times_per_week":
      return habit.target === 1 ? "Once a week" : `${habit.target} days a week`;
    case "amount_per_day":
      return `${describeAmount(habit.target, habit.unit)} a day`;
    case "amount_per_week":
      return `${describeAmount(habit.target, habit.unit)} a week`;
  }
}

/** "Mon · Wed · Fri", in calendar order rather than the order they were clicked. */
export function describeDays(days: readonly Weekday[]): string {
  if (days.length === 0) return "No days chosen";
  if (days.length === 7) return "Every day";
  return [...days]
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_NAMES[day].slice(0, 3))
    .join(" · ");
}

/** "15m" for a minutes habit, "5 times" for a count one. */
export function describeAmount(amount: number, unit: HabitAmountUnit): string {
  if (unit === "minutes") return formatDuration(amount);
  return amount === 1 ? "Once" : `${amount} times`;
}

/** "2 of 3 days" · "80m of 2h" · "3 of 5 times". Boolean habits count days; count amount habits count times. */
export function describeProgress(habit: Habit, achieved: number, target: number): string {
  if (habit.unit === "minutes") {
    return `${formatDuration(achieved)} of ${formatDuration(target)}`;
  }
  const noun = isAmountHabit(habit.frequencyType) ? "times" : "days";
  return `${achieved} of ${target} ${noun}`;
}

export const DAY_STATE_LABELS: Record<HabitDayState, string> = {
  met: "Done",
  partial: "Some",
  open: "Not recorded",
  ahead: "Coming up",
  free: "Not scheduled",
};

/** A rate as a percentage, or an em dash when there is nothing to measure — "no data yet" is not "0%". */
export function formatRate(rate: HabitRate): string {
  if (rate.value === null) return "—";
  return `${Math.round(rate.value * 100)}%`;
}

/** What the rate was measured over: days for a per-day habit, target units over whole weeks for a per-week one. */
export function describeRate(rate: HabitRate, unit: "day" | "week"): string {
  if (rate.value === null) return "Not enough history yet";
  if (unit === "week") return `${rate.met} of ${rate.expected} counted, over whole weeks`;
  return `${rate.met} of ${rate.expected} days`;
}

/** "9 days" · "1 week". A fact, never a warning. */
export function describeStreak(length: number, unit: "day" | "week"): string {
  if (length === 0) return "None yet";
  return `${length} ${unit}${length === 1 ? "" : "s"}`;
}

export const HABITS_COPY = {
  pageDescription: "What you are keeping up, and how consistently.",
  consistency: "Consistency",
  consistencyHint: "Share of the last 30 days this habit was met.",
  thisWeek: "This week",
  thisMonth: "This month",
  bestStreak: "Best run",
  currentStreak: "Current run",
  addToWeek: "Add to week",
  addToWeekHint: "Reserves time on the calendar for the rest of this week.",
  alreadyReserved: "This week already has time reserved for every session.",
  emptyActiveTitle: "No habits yet",
  emptyActiveBody:
    "Add something you want to keep up. A day without a record only moves a percentage.",
  emptyArchivedTitle: "No archived habits",
  emptyArchivedBody: "Habits you stop tracking are kept here, with their history intact.",
  archiveHint: "Archiving keeps every completion and every point earned.",
  deleteHint:
    "This removes the habit, every day recorded for it and its calendar blocks. Archiving keeps them all.",
  outsideWindow: "Completions are recorded for yesterday, today or tomorrow.",
} as const;
