import { habitDay, type HabitCompletionLike, type HabitSchedule } from "@momentum/core/habits";
import { addDays, formatLocalDate, weekOf } from "@momentum/core/time";
import type { LocalDate, Weekday } from "@momentum/core/types";
import type { HeatmapWeek } from "@momentum/ui/components/habit-heatmap";

import { DAY_STATE_LABELS } from "@/features/habits/copy";

/**
 * A habit's history as the heatmap's columns, built from the same `habitDay`
 * the week strip uses. Columns run week-start first in the user's week shape;
 * days outside `[from, to]` or before `trackedFrom` are `null`, not "free".
 * Pure: every boundary is a parameter.
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
