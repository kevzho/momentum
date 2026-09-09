import { amountsByDate, contributionOf, dailyTargetOf, isScheduledOn } from "../habits";
import type { LocalDate, Uuid } from "../types/scalars";
import type { HabitCompletionFact, HabitFact } from "./facts";
import type { AnalyticsPeriod } from "./period";

/**
 * Habit consistency, one row per local date — the heatmap's data, and the
 * habit-completion rate on the summary tiles.
 *
 * Consistency, never streaks (Domain Rule 7). A day nothing happened on lowers
 * a rate; it deletes nothing, resets nothing and is not drawn as a penalty.
 *
 * Two rules carried over from `@momentum/core/habits`, because a rate that
 * disagreed with the habits page would be a second opinion about the same
 * facts:
 *
 * - **A habit is only answerable for the dates it existed.** `trackedFrom` is
 *   its creation date and `archivedFrom` the date it was retired; outside that
 *   span it expects nothing. A habit created on Thursday is not 0% for Monday.
 * - **Today is not over.** The last date of the period counts toward the
 *   denominator only once it has been met, so an unfinished day can raise the
 *   rate and never lower it.
 *
 * Only the per-day cadence produces an expectation for a specific date:
 * "three times a week, any days" names no day, and treating an arbitrary one as
 * due would invent a schedule the user did not choose. Completions of those
 * habits are still recorded on the day they happened — that is what `recorded`
 * carries — so the heatmap shows the work without inventing a target for it.
 */

/** One date of the heatmap. */
export interface HabitDay {
  date: LocalDate;
  /** Per-day-cadence habits that asked for something on this date. */
  expected: number;
  /** How many of those reached their target. */
  met: number;
  /**
   * Habits with anything recorded on this date, per-week cadences included.
   * A day may have `recorded > 0` and `expected === 0`.
   */
  recorded: number;
}

/** Met over expected. `value` is null when nothing was expected — "no data" is not "0%". */
export interface HabitRateValue {
  met: number;
  expected: number;
  value: number | null;
}

/** Chart 4: the consistency grid, one entry per date in the period. */
export function habitConsistencyByDay(
  habits: readonly HabitFact[],
  completions: readonly HabitCompletionFact[],
  period: AnalyticsPeriod,
): HabitDay[] {
  const amountsByHabit = new Map<Uuid, ReadonlyMap<LocalDate, number>>();
  for (const habit of habits) {
    amountsByHabit.set(
      habit.id,
      amountsByDate(completions.filter((row) => row.habitId === habit.id)),
    );
  }

  return period.days.map((date) => {
    let expected = 0;
    let met = 0;
    let recorded = 0;

    for (const entry of habits) {
      const amounts = amountsByHabit.get(entry.id);
      const amount = amounts?.get(date) ?? 0;
      if (amount > 0) recorded += 1;

      if (!tracksDate(entry, date)) continue;
      if (!isScheduledOn(entry.habit, date)) continue;

      expected += 1;
      const target = dailyTargetOf(entry.habit) ?? 1;
      if (contributionOf(entry.habit, amount) >= target) met += 1;
    }

    return { date, expected, met, recorded };
  });
}

/**
 * The period's habit completion rate.
 *
 * The final date is excluded from the denominator unless it was fully met —
 * the same rule `habitStats` applies to today, so the two surfaces cannot
 * disagree about a day that is still in progress.
 */
export function habitCompletionRate(days: readonly HabitDay[]): HabitRateValue {
  let met = 0;
  let expected = 0;

  days.forEach((day, index) => {
    const isLastDay = index === days.length - 1;
    if (isLastDay && day.met < day.expected) return;
    met += day.met;
    expected += day.expected;
  });

  return { met, expected, value: expected === 0 ? null : met / expected };
}

/** Whether the habit existed, and had not been archived, on this date. */
function tracksDate(entry: HabitFact, date: LocalDate): boolean {
  if (date < entry.trackedFrom) return false;
  return entry.archivedFrom === null || date < entry.archivedFrom;
}
