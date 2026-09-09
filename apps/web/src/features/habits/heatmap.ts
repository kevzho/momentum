import { habitDay, type HabitCompletionLike, type HabitSchedule } from "@momentum/core/habits";
import { addDays, formatLocalDate, weekOf } from "@momentum/core/time";
import type { LocalDate, Weekday } from "@momentum/core/types";
import type { HeatmapWeek } from "@momentum/ui/components/habit-heatmap";

import { DAY_STATE_LABELS } from "@/features/habits/copy";

/**
 * A habit's history, laid out as the heatmap's columns.
 *
 * The grid is built from the same `habitDay` the week strip uses, so the two
 * views of the same day can never disagree — the heatmap is the week strip
 * repeated, not a second interpretation of the rows.
 *
 * Columns run week-start first, in the *user's* week shape, so the top row of
 * the grid is the same weekday all the way across whichever start they chose
 * (Domain Rule 4). Days outside `[from, to]` are `null` rather than "free": a
 * cell for a day the range does not cover would be a claim about it.
 *
 * Pure, and takes every boundary as a parameter — it reads no clock.
 */
export function buildHeatmap(input: {
  habit: HabitSchedule;
  completions: readonly HabitCompletionLike[];
  from: LocalDate;
  to: LocalDate;
  today: LocalDate;
  weekStart: Weekday;
  /** Nothing is expected of the habit before this date. */
  trackedFrom: LocalDate;
}): HeatmapWeek[] {
  const { habit, completions, from, to, today, weekStart, trackedFrom } = input;

  const amounts = new Map<LocalDate, number>();
  for (const completion of completions) {
    amounts.set(
      completion.completionDate,
      (amounts.get(completion.completionDate) ?? 0) + completion.amount,
    );
  }

  const weeks: HeatmapWeek[] = [];
  for (let start = weekOf(from, weekStart).start; start <= to; start = addDays(start, 7)) {
    weeks.push({
      key: start,
      days: Array.from({ length: 7 }, (_, index) => {
        const date = addDays(start, index);
        if (date < from || date > to || date < trackedFrom) return null;

        const day = habitDay(habit, date, amounts.get(date) ?? 0, today);
        return {
          key: date,
          state: day.state,
          label: `${formatLocalDate(date, "long")}: ${DAY_STATE_LABELS[day.state].toLowerCase()}`,
        };
      }),
    });
  }

  return weeks;
}

/** Seven short weekday names, week-start first — the heatmap's row labels. */
export function heatmapDayLabels(weekStart: Weekday, week: readonly LocalDate[]): string[] {
  if (week.length === 7) return week.map((date) => formatLocalDate(date, "weekday"));
  // A caller without a resolved week still gets the right rotation.
  const reference = weekOf("2026-09-06" as LocalDate, weekStart).days;
  return reference.map((date) => formatLocalDate(date, "weekday"));
}
