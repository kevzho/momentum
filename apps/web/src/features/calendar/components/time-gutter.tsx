import * as React from "react";

import type { GridSpec } from "@momentum/core/calendar";
import { formatMinutesOfDay } from "@momentum/core/time";
import type { Minutes } from "@momentum/core/types";

/**
 * The hour ruler: labels down the left edge and lines across each day column,
 * both from one row count. One line per hour, not one cell per snap increment.
 */

/** The wall-clock minute of every hour line, from the spec's window. */
export function hourMarks(spec: GridSpec): Minutes[] {
  const span = spec.dayEndMinutes - spec.dayStartMinutes;
  const count = Math.max(1, Math.round(span / 60));
  return Array.from({ length: count }, (_, index) => spec.dayStartMinutes + index * 60);
}

/** The time labels. `aria-hidden`: every block already carries its own time range in its name. */
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
 * The lines inside one day column; they give the column its height, since the
 * blocks are absolutely positioned. `pointer-events-none` is load-bearing: the
 * column treats a click on itself as "create here".
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
