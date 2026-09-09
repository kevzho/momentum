import { yFromMinutes } from "@momentum/core/calendar";
import { minutesFromMidnight } from "@momentum/core/time";
import type { Instant } from "@momentum/core/types";

import type { CalendarSettings } from "@/features/calendar/types";

/**
 * The now-line, on today's column only.
 *
 * It is placed with the same `yFromMinutes` every block uses, so it cannot
 * drift from the thing it is measuring. The caller renders it only once `now`
 * is non-null — before hydration there is no clock reading in the markup at
 * all, which is what keeps the server and client trees identical
 * (docs/ARCHITECTURE.md §10).
 *
 * Not interactive and never a pointer target: the column underneath treats a
 * click as "create a block here", and a line that swallowed the pointer would
 * put a dead stripe across the middle of the working day. Hidden from
 * assistive technology for the same reason it is subtle — it is a glance, not
 * a control, and the current time is not something the grid should repeat.
 */
export function CurrentTimeIndicator({
  now,
  settings,
}: {
  now: Instant;
  settings: CalendarSettings;
}) {
  const top = yFromMinutes(minutesFromMidnight(now, settings.timezone), settings.spec);

  return (
    <div
      data-slot="now-line"
      aria-hidden="true"
      style={{ top: `${top}px` }}
      className="pointer-events-none absolute inset-x-0 flex -translate-y-1/2 items-center"
    >
      <span className="size-1.5 shrink-0 rounded-full bg-primary" />
      <span className="h-px flex-1 bg-primary" />
    </div>
  );
}
