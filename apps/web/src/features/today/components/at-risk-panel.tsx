import Link from "next/link";
import { AlertCircleIcon, CalendarClockIcon, ClockAlertIcon } from "lucide-react";

import { Button } from "@momentum/ui/components/button";

import { AT_RISK_OVERDUE_LIMIT } from "@/features/today/agenda";
import { TODAY_COPY, describeRisk, riskKey } from "@/features/today/copy";
import type { TodayRisk } from "@/features/today/types";

/**
 * Rendered only when there is something to say: the caller renders nothing
 * for an empty list. Overdue rows are capped, with a link to the full list.
 */
export function AtRiskPanel({ risks }: { risks: readonly TodayRisk[] }) {
  if (risks.length === 0) return null;

  const overdue = risks.filter((risk) => risk.kind === "overdue");
  const shown = [
    ...overdue.slice(0, AT_RISK_OVERDUE_LIMIT),
    ...risks.filter((risk) => risk.kind !== "overdue"),
  ];
  const hidden = overdue.length - Math.min(overdue.length, AT_RISK_OVERDUE_LIMIT);

  return (
    <section
      data-slot="at-risk"
      aria-labelledby="at-risk-heading"
      className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2
          id="at-risk-heading"
          className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          {TODAY_COPY.risk.title}
        </h2>
        <span data-slot="numeric" className="text-xs text-muted-foreground">
          {TODAY_COPY.risk.count(risks.length)}
        </span>
      </div>

      <ul className="flex flex-col gap-1.5">
        {shown.map((risk) => {
          const Icon = RISK_ICON[risk.kind];
          return (
            <li key={riskKey(risk)} className="flex items-start gap-2 text-sm">
              <Icon className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
              <span className="min-w-0">{describeRisk(risk)}</span>
            </li>
          );
        })}
      </ul>

      {hidden > 0 ? (
        <Button variant="ghost" size="sm" className="self-start" asChild>
          <Link href="/tasks">{TODAY_COPY.risk.seeAll}</Link>
        </Button>
      ) : null}
    </section>
  );
}

/** A glyph per kind, so the three are distinguishable without relying on colour. */
const RISK_ICON: Record<TodayRisk["kind"], typeof AlertCircleIcon> = {
  overdue: ClockAlertIcon,
  "insufficient-time": AlertCircleIcon,
  overlap: CalendarClockIcon,
};
