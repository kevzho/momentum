import type { Insight } from "@momentum/core/analytics";

import { ANALYTICS_COPY } from "@/features/analytics/copy";

/**
 * Every sentence here was computed and gated in `@momentum/core/analytics`;
 * this component adds no words beyond the heading and the caveat. An empty
 * panel is shown, not hidden.
 */
export function InsightsPanel({ insights }: { insights: readonly Insight[] }) {
  return (
    <section className="flex flex-col gap-2" aria-labelledby="analytics-patterns">
      <h2
        id="analytics-patterns"
        className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        {ANALYTICS_COPY.insights.title}
      </h2>

      {insights.length === 0 ? (
        <p className="text-sm text-muted-foreground">{ANALYTICS_COPY.insights.empty}</p>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {insights.map((insight) => (
              <li key={insight.id} className="flex gap-2 text-sm">
                <span
                  aria-hidden="true"
                  className="mt-1.5 size-1 shrink-0 rounded-full bg-border"
                />
                <span className="min-w-0">{insight.text}</span>
              </li>
            ))}
          </ul>
          <p className="text-2xs text-muted-foreground">{ANALYTICS_COPY.insights.caveat}</p>
        </>
      )}
    </section>
  );
}
