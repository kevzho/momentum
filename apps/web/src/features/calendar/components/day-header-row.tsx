import { formatLocalDate } from "@momentum/core/time";
import { cn } from "@momentum/ui/lib/utils";

import type { CalendarDay } from "@/features/calendar/types";

/**
 * The row of day headers above the grid.
 *
 * Today is distinguished, not shouting (specs/03-weekly-calendar.md): a tinted
 * cell and a weighted date, both built from the accent pair so they survive
 * either theme, plus a word for anyone who cannot see either. The tint on the
 * column itself continues the same signal downward.
 */
export function DayHeaderRow({
  days,
  gridClassName,
}: {
  days: readonly CalendarDay[];
  gridClassName: string;
}) {
  return (
    <div data-slot="day-header-row" className={cn(gridClassName, "border-b")}>
      {/* The corner above the time gutter: empty, and sticky so a sideways
          scroll never slides a day column under the hour labels. */}
      <div className="sticky left-0 z-sticky border-r bg-background" />

      {days.map((day) => (
        <div
          key={day.date}
          data-today={day.isToday || undefined}
          className={cn(
            "flex min-w-0 items-baseline justify-center gap-1.5 border-r py-2 last:border-r-0",
            day.isToday && "bg-accent",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "truncate text-2xs font-medium tracking-wide uppercase",
              day.isToday ? "text-accent-foreground" : "text-muted-foreground",
            )}
          >
            {day.weekdayLabel}
          </span>
          <span
            aria-hidden="true"
            data-slot="numeric"
            className={cn(
              "text-xs",
              day.isToday ? "font-semibold text-accent-foreground" : "text-foreground",
            )}
          >
            {day.dayOfMonthLabel}
          </span>
          <span className="sr-only">
            {formatLocalDate(day.date, "long")}
            {day.isToday ? " (today)" : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
