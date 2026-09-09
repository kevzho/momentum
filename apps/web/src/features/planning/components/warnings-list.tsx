import * as React from "react";
import { CalendarClockIcon, GaugeIcon, HourglassIcon, LayersIcon } from "lucide-react";

import {
  describeWarning,
  warningKey,
  type PlanningWarning,
  type PlanningWarningKind,
} from "@momentum/core/scheduling";

import { WARNINGS } from "@/features/planning/copy";

/**
 * The conflict warnings. Information only: nothing here is a button and
 * nothing blocks an action. One glyph per kind, so kinds are told apart by shape.
 */

const WARNING_ICON: Record<PlanningWarningKind, typeof CalendarClockIcon> = {
  "past-deadline": CalendarClockIcon,
  overlap: LayersIcon,
  "over-capacity": GaugeIcon,
  "insufficient-time": HourglassIcon,
};

export function WarningsList({ warnings }: { warnings: readonly PlanningWarning[] }) {
  const headingId = React.useId();

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1">
      <h2
        id={headingId}
        className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        {WARNINGS.heading}
        {warnings.length === 0 ? null : (
          <>
            {" "}
            <span data-slot="numeric" className="font-normal">
              {warnings.length}
            </span>
          </>
        )}
      </h2>
      {warnings.length === 0 ? (
        <p className="px-2 text-xs text-muted-foreground">{WARNINGS.none}</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {warnings.map((warning) => {
            const Icon = WARNING_ICON[warning.kind];
            return (
              <li
                key={warningKey(warning)}
                data-kind={warning.kind}
                className="flex items-start gap-2 px-2 py-1 text-xs"
              >
                <Icon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-warning" />
                <span className="min-w-0">{describeWarning(warning)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
