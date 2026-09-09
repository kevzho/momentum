import * as React from "react";

import type { WeekCapacity } from "@momentum/core/scheduling";
import { formatDuration } from "@momentum/core/time";

import { APPROXIMATE_PREFIX, CAPACITY } from "@/features/planning/copy";

/** The three lines of the capacity display. AVAILABLE carries a tilde because it is an estimate. */
export function CapacitySummary({ capacity }: { capacity: WeekCapacity }) {
  const headingId = React.useId();

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="sr-only">
        {CAPACITY.heading}
      </h2>
      <dl className="flex flex-col gap-1 px-2 text-xs">
        <CapacityRow label={CAPACITY.planned} value={formatDuration(capacity.plannedMinutes)} />
        <CapacityRow
          label={CAPACITY.available}
          value={`${APPROXIMATE_PREFIX}${formatDuration(capacity.availableMinutes)}`}
        />
        <CapacityRow
          label={CAPACITY.unscheduled}
          value={formatDuration(capacity.unscheduledMinutes)}
        />
      </dl>
    </section>
  );
}

function CapacityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd data-slot="numeric" className="font-medium">
        {value}
      </dd>
    </div>
  );
}
