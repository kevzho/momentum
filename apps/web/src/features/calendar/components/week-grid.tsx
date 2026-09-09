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
 * that has been projected onto them.
 *
 * The grid renders and it reports intent; it never mutates and it never does
 * date maths. Wall-clock minutes arrive already resolved in the profile
 * timezone (`projection.ts`), pixels come from `@momentum/core/calendar`, and
 * what a drag does with either is the interaction layer's business. The seam
 * between the three is `DayColumn` / `BlockShell`, which this file composes and
 * does not own.
 *
 * An empty week is a legitimate week. There is deliberately no empty state
 * over the grid: the hours are the content, and covering them would hide the
 * one surface the user came here to plan on.
 */

/**
 * The seam around a block, so two side-by-side blocks read as two surfaces and
 * an hour-long block does not merge into the one that starts where it ends.
 *
 * It is padding on the positioned box rather than a smaller box, so the box the
 * pointer hits and the box the geometry computed stay the same rectangle.
 */
const BLOCK_INSET_PX = 2;
const BLOCK_GAP_PX = 1;

const NO_SEGMENTS: readonly ItemSegment[] = [];

/**
 * React's `CSSProperties` has no room for custom properties, and the grid has
 * to publish one: the hour height is a design token everything in the column
 * measures against, and the spec's `hourHeightPx` is what the block geometry
 * measures against. Writing the spec's value into the token is what keeps a
 * non-default spec from sliding the lines out from under the blocks.
 */
type CalendarCanvasStyle = React.CSSProperties & Record<"--calendar-hour-height", string>;

/** Props the shared contract does not carry yet. See the report accompanying this lane. */
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

  /**
   * The opening scroll position, once per displayed range. In an effect rather
   * than a layout effect because this component also renders on the server,
   * where `useLayoutEffect` is a warning and a scroll offset is meaningless;
   * the correction lands in the same frame as hydration.
   */
  const scrollTopPx = yFromMinutes(scrollToMinutes, spec);
  const applied = React.useRef(false);
  React.useEffect(() => {
    // Once per mount, and the board keys this component on the displayed range,
    // so that is once per week. Re-applying it whenever the offset changed
    // would scroll the grid out from under a user who just created an early
    // block — the offset is where the week *opens*, not where it belongs.
    if (applied.current) return;
    const node = scroller.current;
    if (node === null) return;
    applied.current = true;
    node.scrollTop = scrollTopPx;
  }, [scrollTopPx]);

  /**
   * Which column the now-line belongs to is asked of the clock, not of the
   * server's `today`: for the minutes between local midnight and the rollover
   * refresh the two disagree, and the line has to stay with the time it is
   * drawing (docs/ARCHITECTURE.md §10).
   */
  const nowDate = React.useMemo(
    () => (now === null ? null : localDateOf(now, timezone)),
    [now, timezone],
  );

  // A roving tabindex over the columns: today is where a keyboard user wants to
  // land, and every other column is reachable from there.
  const todayIndex = days.findIndex((day) => day.isToday);
  const focusIndex = todayIndex === -1 ? 0 : todayIndex;

  return (
    <div
      ref={scroller}
      data-slot="week-grid"
      className="min-h-0 flex-1 overflow-auto rounded-lg border"
    >
      <div className={cn(canvasClassName, "relative")} style={canvasStyle}>
        {/* The chrome: it stays put vertically, scrolls sideways with the days,
            and sits above the body's own stacking context so the blocks pass
            under it rather than through it. */}
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

        {/* `isolate` keeps the sticky gutter above the blocks without letting it
            compete with the sticky header: one stacking context for the body,
            one level of z-index inside it. */}
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
                // The clip belongs on the column rather than on a wrapper: it
                // has to cut the column's contents without cutting the
                // column's own focus ring (see `calendar-day-clip`).
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
                    // Entering a keyboard mode starts the candidate on the
                    // block itself, where its caption would only overprint the
                    // block's title; the caption appears once there is a
                    // second position to name.
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
 * Where a drag, a resize or a keyboard move would put the block if it committed
 * now. Nothing has been written yet (docs/ARCHITECTURE.md §9 step 4), so this
 * is a preview and not a block: not a pointer target, not in the tab order, and
 * not announced — the interaction layer announces candidate changes itself,
 * through the one live region.
 *
 * Solid where the grid cursor is dashed, and captioned with the span it would
 * commit to, because the two previews can be on screen at once and they mean
 * different things: one is where Enter would create, this is where the thing
 * already in the user's hand would land.
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

/**
 * A segment's box, in the column's coordinates.
 *
 * Both edges go through `yFromMinutes` rather than through a duration times a
 * scale factor, so a block can never disagree with the hour line it sits on.
 * The floor is `MIN_RENDERED_MINUTES`: a ten-minute block is still a block, and
 * the overlap layout already reserved the same floor for it.
 */
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

/**
 * The block's accessible name. `itemLabel` describes the whole item — the same
 * sentence a sighted user reads off it — and the continuation suffix is the one
 * thing a segment knows that the item does not: that this row is the second
 * half of something that started yesterday.
 */
function blockLabel(segment: ItemSegment, timezone: IanaTimeZone): string {
  const label = itemLabel(segment.item, timezone);
  return segment.isStart ? label : `${label}, continued from the previous day`;
}
