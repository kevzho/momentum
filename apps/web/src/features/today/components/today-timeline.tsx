import Link from "next/link";
import { CalendarDaysIcon } from "lucide-react";

import type { Instant } from "@momentum/core/types";

import { Button } from "@momentum/ui/components/button";
import { EmptyState } from "@momentum/ui/components/empty-state";

import { timelineStateOf } from "@/features/today/agenda";
import { TODAY_COPY } from "@/features/today/copy";
import { TimelineRow } from "@/features/today/components/timeline-row";
import { TodaySection } from "@/features/today/components/today-section";
import type { TodayGuide, TodayItem } from "@/features/today/types";

/** Today's timeline. Row state is derived from `now` on every tick, never stored. */
export function TodayTimeline({
  entries,
  guide,
  now,
  pendingIds,
  onToggle,
}: {
  entries: readonly TodayItem[];
  /** For the empty state: an account with nothing to schedule is pointed at capture. */
  guide: TodayGuide;
  now: Instant;
  pendingIds: ReadonlySet<string>;
  onToggle: (entry: TodayItem, completed: boolean) => void;
}) {
  const done = entries.filter((entry) => entry.item.completedAt !== null).length;

  return (
    <TodaySection
      title={TODAY_COPY.timeline.title}
      count={entries.length === 0 ? undefined : `${done}/${entries.length}`}
    >
      {entries.length === 0 ? (
        <EmptyState
          icon={CalendarDaysIcon}
          title={TODAY_COPY.timeline.emptyTitle}
          description={
            guide === "capture"
              ? TODAY_COPY.timeline.captureDescription
              : TODAY_COPY.timeline.emptyDescription
          }
          // Next Up, just above, already carries the one "Add a task" for a new account.
          action={
            guide === "capture" ? null : (
              <Button variant="outline" size="sm" asChild>
                <Link href="/calendar">{TODAY_COPY.timeline.openCalendar}</Link>
              </Button>
            )
          }
        />
      ) : (
        <ol className="flex flex-col">
          {entries.map((entry) => (
            <TimelineRow
              key={entry.item.id}
              entry={entry}
              state={timelineStateOf(entry, now)}
              pending={pendingIds.has(entry.item.id)}
              onToggle={onToggle}
            />
          ))}
        </ol>
      )}
    </TodaySection>
  );
}
