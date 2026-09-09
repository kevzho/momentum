import * as React from "react";

import type { DayWorkload } from "@momentum/core/scheduling";
import { formatDuration, formatLocalDate } from "@momentum/core/time";
import type { LocalDate, Minutes } from "@momentum/core/types";

import { cn } from "@momentum/ui/lib/utils";

import { WORKLOAD_HEADING, workloadRowLabel } from "@/features/planning/copy";

/**
 * Per-day workload (specs/05-week-planning.md):
 *
 *     Mon ███████░░   6h 30m
 *     Tue ████░░░░░   3h 25m
 *
 * Each row is a bar of the day's planned minutes drawn over a faint track of
 * its working window, so the eye can compare the two without being told what
 * to think about them. Every bar shares one scale — the longest planned day,
 * the longest working day, or an hour, whichever is greatest — so lengths are
 * comparable down the column. Past days are muted and today carries a mark;
 * neither is colour alone.
 *
 * Each row is one `role="img"` with the whole fact as its name. Nothing here
 * characterises a day (Domain Rule 7).
 */

export interface WorkloadRow {
  date: LocalDate;
  plannedMinutes: Minutes;
  workingMinutes: Minutes;
  isPast: boolean;
}

/** The floor under the scale: a week of empty days still draws an hour-wide track. */
const MIN_SCALE_MINUTES: Minutes = 60;

export function workloadScale(
  rows: readonly Pick<WorkloadRow, "plannedMinutes" | "workingMinutes">[],
): Minutes {
  return rows.reduce(
    (scale, row) => Math.max(scale, row.plannedMinutes, row.workingMinutes),
    MIN_SCALE_MINUTES,
  );
}

/**
 * One row per displayed day, in display order, from the capacity's per-day
 * list. Looked up by date rather than by index so the drawer never depends on
 * the engine returning days in any particular order; a day the engine did not
 * report (it always does) draws as empty rather than crashing the column.
 */
export function workloadRows(
  days: readonly LocalDate[],
  workloads: readonly DayWorkload[],
  today: LocalDate,
): WorkloadRow[] {
  const byDate = new Map(workloads.map((day) => [day.date, day]));
  return days.map((date) => {
    const day = byDate.get(date);
    return {
      date,
      plannedMinutes: day?.plannedMinutes ?? 0,
      workingMinutes: day?.workingMinutes ?? 0,
      isPast: day?.isPast ?? date < today,
    };
  });
}

/** A bar's width, as a CSS percentage of the shared scale. */
function widthOf(minutes: Minutes, scale: Minutes): string {
  const ratio = Math.min(1, Math.max(0, minutes / scale));
  return `${Math.round(ratio * 1000) / 10}%`;
}

export function WorkloadBars({
  days,
  workloads,
  today,
}: {
  days: readonly LocalDate[];
  workloads: readonly DayWorkload[];
  today: LocalDate;
}) {
  const headingId = React.useId();
  const rows = workloadRows(days, workloads, today);
  const scale = workloadScale(rows);

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1">
      <h2
        id={headingId}
        className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        {WORKLOAD_HEADING}
      </h2>
      <div className="flex flex-col gap-1 px-2">
        {rows.map((row) => {
          const isToday = row.date === today;
          return (
            <div
              key={row.date}
              role="img"
              aria-label={workloadRowLabel({ ...row, isToday })}
              data-past={row.isPast || undefined}
              data-today={isToday || undefined}
              className={cn(
                "flex items-center gap-2 text-xs",
                row.isPast && "text-muted-foreground",
              )}
            >
              <span
                className={cn("flex w-9 shrink-0 items-center gap-1", isToday && "font-semibold")}
              >
                {formatLocalDate(row.date, "weekday")}
                {isToday ? <span className="size-1 rounded-full bg-foreground" /> : null}
              </span>
              <span className="relative h-1.5 min-w-0 flex-1">
                <span
                  data-slot="workload-track"
                  className="absolute inset-y-0 left-0 rounded-full bg-muted"
                  style={{ width: widthOf(row.workingMinutes, scale) }}
                />
                <span
                  data-slot="workload-bar"
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-full bg-primary",
                    row.isPast && "bg-primary/40",
                  )}
                  style={{ width: widthOf(row.plannedMinutes, scale) }}
                />
              </span>
              <span data-slot="numeric" className="w-12 shrink-0 text-right">
                {formatDuration(row.plannedMinutes)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
