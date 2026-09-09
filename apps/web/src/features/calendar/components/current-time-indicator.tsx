import { yFromMinutes } from "@momentum/core/calendar";
import { minutesFromMidnight } from "@momentum/core/time";
import type { Instant } from "@momentum/core/types";

import type { CalendarSettings } from "@/features/calendar/types";

/**
 * The now-line. Rendered only once `now` is non-null, so the server and client
 * trees stay identical. Never a pointer target: the column underneath treats a
 * click as "create here".
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
