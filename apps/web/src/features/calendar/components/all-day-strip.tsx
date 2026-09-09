"use client";

import { CalendarBlock } from "@momentum/ui/components/calendar-block";
import { cn } from "@momentum/ui/lib/utils";

import { itemLabel } from "@/features/calendar/projection";
import type {
  CalendarCallbacks,
  CalendarDay,
  CalendarItem,
  CalendarSettings,
} from "@/features/calendar/types";

/** All-day items, in a compact strip between the day headers and the grid. Rendered only when non-empty. */
export interface AllDayStripProps {
  days: readonly CalendarDay[];
  /** Keyed by `LocalDate`, from `buildAllDay` in `projection.ts`. */
  itemsByDate: ReadonlyMap<string, readonly CalendarItem[]>;
  settings: CalendarSettings;
  callbacks: CalendarCallbacks;
  /** The column template the rest of the grid is using; the strip lines up with it. */
  gridClassName: string;
}

export function AllDayStrip({
  days,
  itemsByDate,
  settings,
  callbacks,
  gridClassName,
}: AllDayStripProps) {
  const hasAny = days.some((day) => (itemsByDate.get(day.date)?.length ?? 0) > 0);
  if (!hasAny) return null;

  return (
    <div data-slot="all-day-strip" className={cn(gridClassName, "border-b")}>
      <div className="sticky left-0 z-sticky flex items-start justify-end border-r bg-background px-1.5 py-1 text-2xs text-muted-foreground">
        All day
      </div>

      {days.map((day) => (
        <div
          key={day.date}
          // `min-w-0` and the clip keep a long title from widening its day.
          className={cn(
            "flex min-w-0 flex-col gap-0.5 overflow-hidden border-r p-0.5 last:border-r-0",
            day.isToday && "bg-accent/40",
          )}
        >
          {(itemsByDate.get(day.date) ?? []).map((item) => (
            <button
              key={item.id}
              type="button"
              aria-label={itemLabel(item, settings.timezone)}
              onClick={() => callbacks.onOpenItem(item)}
              className="block w-full rounded-md text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <CalendarBlock
                kind={item.kind}
                title={item.title}
                color={item.color}
                completed={item.completedAt !== null}
                compact
              />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
