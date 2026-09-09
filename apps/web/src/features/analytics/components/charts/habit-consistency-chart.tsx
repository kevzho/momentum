"use client";

import { weeksOfPeriod, type HabitDay } from "@momentum/core/analytics";
import type { LocalDate, Weekday } from "@momentum/core/types";
import type { HeatmapCell, HeatmapState, HeatmapWeek } from "@momentum/ui/components/habit-heatmap";
import { HabitHeatmap } from "@momentum/ui/components/habit-heatmap";

import {
  ChartFigure,
  type ChartTableColumn,
} from "@/features/analytics/components/charts/chart-figure";
import { ANALYTICS_COPY, dayLabel, longDayLabel } from "@/features/analytics/copy";
import { WEEKDAY_NAMES, weekdaysFrom } from "@/features/settings/weekday-names";

/**
 * Chart 4 — habit consistency, as a grid of weeks.
 *
 * The one visualization here that is not Recharts, on purpose. A consistency
 * grid is a calendar, not a plot: `HabitHeatmap` already exists in the design
 * system, already encodes each state with a **shape as well as a fill** so the
 * grid survives greyscale (WCAG 1.4.1), and already writes every cell's date
 * and state as text for assistive technology. Redrawing it with a charting
 * library would trade all of that for consistency of import.
 *
 * There is no red in it and no cell is a penalty: a day nothing was recorded on
 * is a hollow square, never a mark against the user (Domain Rule 7).
 */
export function HabitConsistencyChart({
  days,
  weekStart,
}: {
  days: readonly HabitDay[];
  weekStart: Weekday;
}) {
  const byDate = new Map<LocalDate, HabitDay>(days.map((day) => [day.date, day]));
  const dates = days.map((day) => day.date);

  const weeks: HeatmapWeek[] = weeksOfPeriod(dates, weekStart).map((week) => ({
    key: week.start,
    days: week.days.map((date) => (date === null ? null : cellFor(byDate.get(date), date))),
  }));

  const columns: ChartTableColumn<HabitDay>[] = [
    { header: ANALYTICS_COPY.columns.date, cell: (row) => dayLabel(row.date) },
    { header: ANALYTICS_COPY.columns.expected, cell: (row) => row.expected },
    { header: ANALYTICS_COPY.columns.recorded, cell: (row) => row.met },
  ];

  return (
    <ChartFigure
      title={ANALYTICS_COPY.charts.habits.title}
      description={ANALYTICS_COPY.charts.habits.description}
      empty={ANALYTICS_COPY.charts.habits.empty}
      isEmpty={days.every((day) => day.expected === 0 && day.recorded === 0)}
      rows={days}
      columns={columns}
      rowKey={(row) => row.date}
    >
      <div className="flex h-full items-center">
        <HabitHeatmap
          size="lg"
          weeks={weeks}
          dayLabels={weekdaysFrom(weekStart).map((weekday) => WEEKDAY_NAMES[weekday].slice(0, 1))}
          caption={ANALYTICS_COPY.charts.habits.title}
        />
      </div>
    </ChartFigure>
  );
}

/**
 * One day's state.
 *
 * `free` is a day no habit asked anything of — the correct reading for a window
 * that predates the user's habits, and for the per-week cadences that name no
 * particular day. `partial` covers both "some of what was asked was recorded"
 * and "nothing was asked but something was recorded", because both are days
 * with work on them.
 */
function cellFor(day: HabitDay | undefined, date: LocalDate): HeatmapCell {
  const expected = day?.expected ?? 0;
  const met = day?.met ?? 0;
  const recorded = day?.recorded ?? 0;

  const state: HeatmapState =
    expected === 0
      ? recorded > 0
        ? "partial"
        : "free"
      : met >= expected
        ? "met"
        : met > 0 || recorded > 0
          ? "partial"
          : "open";

  return { key: date, state, label: `${longDayLabel(date)}: ${describe(expected, met, recorded)}` };
}

/** The cell's text, for a screen reader and for the hover title. A count, never a verdict. */
function describe(expected: number, met: number, recorded: number): string {
  if (expected > 0) return `${met} of ${expected} recorded`;
  if (recorded > 0) return `${recorded} recorded, none scheduled`;
  return "nothing scheduled";
}
