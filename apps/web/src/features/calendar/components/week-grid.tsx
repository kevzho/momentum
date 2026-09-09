"use client";

import * as React from "react";

import { yFromMinutes, type GridSpec } from "@momentum/core/calendar";
import { localDateOf } from "@momentum/core/time";
import type { IanaTimeZone, Minutes } from "@momentum/core/types";
import { cn } from "@momentum/ui/lib/utils";

import { AllDayStrip } from "@/features/calendar/components/all-day-strip";
import { BlockView } from "@/features/calendar/components/block-view";
import { CurrentTimeIndicator } from "@/features/calendar/components/current-time-indicator";
import { DayHeaderRow } from "@/features/calendar/components/day-header-row";
import { BlockShell, DayColumn } from "@/features/calendar/components/interaction";
import { HourLines, TimeGutter } from "@/features/calendar/components/time-gutter";
import { MIN_RENDERED_MINUTES, itemLabel } from "@/features/calendar/projection";
import type { CandidateSpan, ItemSegment, WeekGridProps } from "@/features/calendar/types";

/**
 * The week board: a time gutter, one column per displayed day, and everything
 * projected onto them. It renders and reports intent; it never mutates and
 * never does date maths. Deliberately no empty state: the hours are the content.
 */

// Padding on the positioned box rather than a smaller box, so the pointer
// target and the computed geometry stay the same rectangle.
const BLOCK_INSET_PX = 2;
const BLOCK_GAP_PX = 1;

const NO_SEGMENTS: readonly ItemSegment[] = [];

// The spec's `hourHeightPx` is written into the CSS token so the hour lines
// and the block geometry measure against the same value.
type CalendarCanvasStyle = React.CSSProperties & Record<"--calendar-hour-height", string>;

export function WeekGrid({
  days,
  settings,
  segmentsByDate,
  now,
  candidate,
  callbacks,
  allDayByDate,
  scrollToMinutes,
  pendingItemIds,
}: WeekGridProps) {
  const { spec, timezone } = settings;
  const scroller = React.useRef<HTMLDivElement | null>(null);

  const singleDay = days.length === 1;
  const gridClassName = singleDay ? "calendar-day-grid" : "calendar-week-grid";
  const canvasClassName = singleDay ? "calendar-canvas-day" : "calendar-canvas";

  const canvasStyle: CalendarCanvasStyle = {
    "--calendar-hour-height": `${spec.hourHeightPx}px`,
  };

  // The opening scroll position. `useEffect`, not `useLayoutEffect`: this also
  // renders on the server.
  const scrollTopPx = yFromMinutes(scrollToMinutes, spec);
  const applied = React.useRef(false);
  React.useEffect(() => {
    // Once per mount (the board keys this on the displayed range). Re-applying
    // on change would scroll the grid out from under a user who just created
    // an early block.
    if (applied.current) return;
    const node = scroller.current;
    if (node === null) return;
    applied.current = true;
    node.scrollTop = scrollTopPx;
  }, [scrollTopPx]);

  // The now-line's column comes from the clock, not the server's `today`: the
  // two disagree between local midnight and the rollover refresh.
  const nowDate = React.useMemo(
    () => (now === null ? null : localDateOf(now, timezone)),
    [now, timezone],
  );

  // Roving tabindex over the columns; today is the initial stop.
  const todayIndex = days.findIndex((day) => day.isToday);
  const focusIndex = todayIndex === -1 ? 0 : todayIndex;

  return (
    <div
      ref={scroller}
      data-slot="week-grid"
      className="min-h-0 flex-1 overflow-auto rounded-lg border"
    >
      <div className={cn(canvasClassName, "relative")} style={canvasStyle}>
        <div className="sticky top-0 z-sticky bg-background">
          <DayHeaderRow days={days} gridClassName={gridClassName} />
          <AllDayStrip
            days={days}
            itemsByDate={allDayByDate}
            settings={settings}
            callbacks={callbacks}
            gridClassName={gridClassName}
          />
        </div>

        {/* `isolate` keeps the sticky gutter above the blocks without competing
            with the sticky header. */}
        <div className={cn(gridClassName, "relative isolate")}>
          <TimeGutter spec={spec} />

          {days.map((day, index) => {
            const segments = segmentsByDate.get(day.date) ?? NO_SEGMENTS;

            return (
              <DayColumn
                key={day.date}
                date={day.date}
                settings={settings}
                isToday={day.isToday}
                callbacks={callbacks}
                tabIndex={index === focusIndex ? 0 : -1}
                // The clip must cut the column's contents without cutting its
                // own focus ring (see `calendar-day-clip`).
                className="calendar-day-clip border-r last:border-r-0"
              >
                <HourLines spec={spec} />

                {segments.map((segment) => (
                  <BlockShell
                    key={segment.key}
                    segment={segment}
                    settings={settings}
                    callbacks={callbacks}
                    style={blockStyle(segment, spec)}
                    label={blockLabel(segment, timezone)}
                    pending={pendingItemIds.has(segment.item.id)}
                  >
                    <BlockView segment={segment} settings={settings} callbacks={callbacks} />
                  </BlockShell>
                ))}

                {candidate !== null && candidate.date === day.date ? (
                  <CandidateOutline
                    candidate={candidate}
                    spec={spec}
                    // No caption while the candidate still sits on its own block.
                    labelled={!segments.some((segment) => coincides(segment, candidate))}
                  />
                ) : null}

                {now !== null && nowDate === day.date ? (
                  <CurrentTimeIndicator now={now} settings={settings} />
                ) : null}
              </DayColumn>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Where an in-flight interaction would put the block. A preview, not a block:
 * not a pointer target, not in the tab order, not announced (the interaction
 * layer announces candidates itself). Solid where the grid cursor is dashed.
 */
function CandidateOutline({
  candidate,
  spec,
  labelled,
}: {
  candidate: CandidateSpan;
  spec: GridSpec;
  labelled: boolean;
}) {
  return (
    <div
      data-slot="candidate"
      aria-hidden="true"
      style={spanStyle(candidate.startMinutes, candidate.endMinutes, 0, 1, spec)}
      className="pointer-events-none absolute overflow-hidden rounded-md border-2 border-primary bg-primary/15 px-1.5 py-0.5 text-2xs font-medium text-foreground"
    >
      {labelled ? <span className="block truncate">{candidate.label}</span> : null}
    </div>
  );
}

/** Whether the candidate sits exactly where this segment's own block already is. */
function coincides(segment: ItemSegment, candidate: CandidateSpan): boolean {
  return (
    segment.item.id === candidate.itemId &&
    segment.startMinutes === candidate.startMinutes &&
    segment.endMinutes === candidate.endMinutes
  );
}

// Both edges go through `yFromMinutes`, so a block never disagrees with the hour line it sits on.
function blockStyle(segment: ItemSegment, spec: GridSpec): React.CSSProperties {
  return {
    ...spanStyle(segment.startMinutes, segment.endMinutes, segment.column, segment.columns, spec),
    padding: `0 ${BLOCK_INSET_PX}px ${BLOCK_GAP_PX}px`,
  };
}

function spanStyle(
  startMinutes: Minutes,
  endMinutes: Minutes,
  column: number,
  columns: number,
  spec: GridSpec,
): React.CSSProperties {
  const renderedEnd = Math.max(endMinutes, startMinutes + MIN_RENDERED_MINUTES);
  const top = yFromMinutes(startMinutes, spec);
  const widthPercent = 100 / columns;

  return {
    top: `${top}px`,
    height: `${yFromMinutes(renderedEnd, spec) - top}px`,
    left: `${column * widthPercent}%`,
    width: `${widthPercent}%`,
  };
}

function blockLabel(segment: ItemSegment, timezone: IanaTimeZone): string {
  const label = itemLabel(segment.item, timezone);
  return segment.isStart ? label : `${label}, continued from the previous day`;
}
