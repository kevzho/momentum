import Link from "next/link";
import { CalendarDaysIcon } from "lucide-react";

import type { Instant } from "@momentum/core/types";

import { Button } from "@momentum/ui/components/button";
import { EmptyState } from "@momentum/ui/components/empty-state";

import { timelineStateOf } from "@/features/today/agenda";
import { TODAY_COPY } from "@/features/today/copy";
import { TimelineRow } from "@/features/today/components/timeline-row";
import { TodaySection } from "@/features/today/components/today-section";
import type { TodayItem } from "@/features/today/types";

/**
 * What am I doing today: every event, work block and habit block that touches
 * today, in chronological order.
 *
 * An ordered list, because the order is the content. The state of each row is
 * derived from `now` on every tick rather than stored, so a row becomes current
 * and then past without a request — and the server's markup and the first
 * client render agree, because both are the same function of `serverNow`
 * (docs/ARCHITECTURE.md §10).
 */
export function TodayTimeline({
  entries,
  now,
  pendingIds,
  onToggle,
}: {
  entries: readonly TodayItem[];
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
          description={TODAY_COPY.timeline.emptyDescription}
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href="/calendar">{TODAY_COPY.timeline.openCalendar}</Link>
            </Button>
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
