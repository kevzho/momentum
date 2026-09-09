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
 * The conflict warnings (specs/05-week-planning.md): overlap, past deadline,
 * over capacity, insufficient time.
 *
 * Information only. Nothing here is a button, nothing blocks an action, and
 * the sentence for each comes from `describeWarning` — a fact about the
 * schedule, never a judgement about the person (Domain Rule 7). The glyph is
 * one per kind so the kinds are told apart by shape, not only by reading.
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
