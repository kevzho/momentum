import { isAmountHabit, type HabitDayState, type HabitRate } from "@momentum/core/habits";
import { formatDuration } from "@momentum/core/time";
import type { Habit, HabitAmountUnit, HabitFrequencyType, Weekday } from "@momentum/core/types";

import { WEEKDAY_NAMES } from "@/features/settings/weekday-names";

/**
 * Every word the habits surface says.
 *
 * It is one module, and it is tested, because Domain Rule 7 is a constraint on
 * *language* as much as on maths. Nothing here may call the user inconsistent,
 * lazy or behind; nothing may describe a day as a failure; nothing may frame a
 * number as something to be afraid of losing. A single stray adjective in a
 * component would be as much a violation as a streak that resets to zero, and
 * a phrase invented at the call site is a phrase no test can see.
 *
 * The neutral vocabulary, once:
 *
 *   met        · "Done"       the target was reached
 *   partial    · "Some"       an amount was recorded, short of the target
 *   open       · "Not recorded"  a past day the habit asked for, with nothing on it
 *   ahead      · "Coming up"  a day that has not finished yet
 *   free       · "Not scheduled"  a day this habit asks nothing of
 */

/* -------------------------------------------------------------------------- */
/* Frequency                                                                  */
/* -------------------------------------------------------------------------- */

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
 * The habit's target, in one line: "Every day · 25m", "Mon · Wed · Fri",
 * "3 days a week", "15m a day", "2h a week".
 *
 * The estimate is appended, not merged: "how much time I reserve for it" and
 * "what the target is" are different facts, and an `amount_per_day` habit of 15
 * minutes with a 20-minute block has both.
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

/* -------------------------------------------------------------------------- */
/* Progress                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * "2 of 3 days" · "80m of 2h" · "3 of 5 times".
 *
 * The noun is what the numbers count. A boolean habit — every day, certain
 * days, days per week — counts days, whichever cadence it is measured over;
 * only a count-based amount habit counts times.
 */
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

/* -------------------------------------------------------------------------- */
/* Rates                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A rate as a percentage, or an em dash when there is nothing to measure.
 *
 * "No data yet" is not "0%". A habit two days old has not failed a month; it
 * has not had one (Domain Rule 8's sample-size caution, and Domain Rule 7's
 * insistence that a number never reads as an accusation).
 */
export function formatRate(rate: HabitRate): string {
  if (rate.value === null) return "—";
  return `${Math.round(rate.value * 100)}%`;
}

/**
 * What the rate was measured over, so the percentage is never bare.
 *
 * The two cadences count different things — days for a per-day habit, target
 * units across whole weeks for a per-week one — so the sentence says which.
 */
export function describeRate(rate: HabitRate, unit: "day" | "week"): string {
  if (rate.value === null) return "Not enough history yet";
  if (unit === "week") return `${rate.met} of ${rate.expected} counted, over whole weeks`;
  return `${rate.met} of ${rate.expected} days`;
}

/** "9 days" · "1 week". A fact, never a warning (Domain Rule 7). */
export function describeStreak(length: number, unit: "day" | "week"): string {
  if (length === 0) return "None yet";
  return `${length} ${unit}${length === 1 ? "" : "s"}`;
}

/* -------------------------------------------------------------------------- */
/* Fixed strings                                                              */
/* -------------------------------------------------------------------------- */

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
