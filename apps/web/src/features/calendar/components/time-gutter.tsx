import * as React from "react";

import type { GridSpec } from "@momentum/core/calendar";
import { formatMinutesOfDay } from "@momentum/core/time";
import type { Minutes } from "@momentum/core/types";

/**
 * The hour ruler, in its two forms: the labels down the left edge and the
 * lines across each day column. They live together because they are one
 * measurement — a label that disagrees with its line is worse than no label —
 * and because the row count is derived once, from the grid spec, rather than
 * hardcoded at each call site.
 *
 * The grid is a known-size structure (docs/ARCHITECTURE.md §9): one line per
 * hour, not one cell per snap increment. Nineteen nodes a column, not seventy-six.
 */

/** The wall-clock minute of every hour line, from the spec's window. */
export function hourMarks(spec: GridSpec): Minutes[] {
  const span = spec.dayEndMinutes - spec.dayStartMinutes;
  const count = Math.max(1, Math.round(span / 60));
  return Array.from({ length: count }, (_, index) => spec.dayStartMinutes + index * 60);
}

/**
 * The time labels. `aria-hidden` on purpose: every block already carries its
 * own time range in its accessible name and every column is labelled by its
 * date, so a screen reader reading nineteen bare numbers on entry would be
 * noise standing between the user and the week.
 *
 * Sticky horizontally, because the week is wider than a phone: the labels have
 * to survive a sideways scroll or the columns lose their meaning.
 */
export const TimeGutter = React.memo(function TimeGutter({ spec }: { spec: GridSpec }) {
  return (
    <div
      data-slot="time-gutter"
      aria-hidden="true"
      className="sticky left-0 z-sticky border-r bg-background"
    >
      {hourMarks(spec).map((minutes) => (
        <div
          key={minutes}
          data-slot="numeric"
          className="h-(--calendar-hour-height) pt-0.5 pr-1.5 text-right text-2xs text-muted-foreground"
        >
          {formatMinutesOfDay(minutes)}
        </div>
      ))}
    </div>
  );
});

/**
 * The lines inside one day column, and the thing that gives the column its
 * height — the blocks are absolutely positioned and contribute nothing.
 *
 * `pointer-events-none` is load-bearing rather than cosmetic: the column
 * treats a click on itself as "create here" and a click on a child as that
 * child's, so a line that swallowed the pointer would make most of the grid
 * uncreatable.
 */
export const HourLines = React.memo(function HourLines({ spec }: { spec: GridSpec }) {
  return (
    <div data-slot="hour-lines" className="pointer-events-none">
      {hourMarks(spec).map((minutes) => (
        <div key={minutes} className="h-(--calendar-hour-height) border-t first:border-t-0" />
      ))}
    </div>
  );
});
