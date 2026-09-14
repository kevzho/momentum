import { DEFAULT_GRID_SPEC, layoutOverlaps, type GridSpec } from "@momentum/core/calendar";
import {
  addDays,
  formatLocalDate,
  formatTimeRange,
  localDateOf,
  minutesFromMidnight,
  splitByLocalDay,
} from "@momentum/core/time";
import type {
  BlockKind,
  IanaTimeZone,
  LocalDate,
  Minutes,
  ProjectColor,
  SnapMinutes,
} from "@momentum/core/types";

import type { CalendarDay, CalendarItem, DaySpan, ItemSegment } from "@/features/calendar/types";

/**
 * Projection from instants onto wall-clock minutes on a named day. The only
 * place the two meet, which is why the timezone appears here and not in the
 * rendering or interaction code.
 */

/** The colour a block falls back to with none of its own and no project to inherit from. */
export const KIND_DEFAULT_COLOR: Record<BlockKind, ProjectColor> = {
  event: "slate",
  work: "blue",
  habit: "teal",
};

/** Blocks shorter than this still have to be legible; the grid renders them at a floor height. */
export const MIN_RENDERED_MINUTES: Minutes = 15;

// Wall clock: a DST day is 23 or 25 hours long but still reads 00:00 to 24:00.
const MINUTES_PER_DAY: Minutes = 1440;

/**
 * The grid's vertical extent: the default window, grown to the hour containing
 * the earliest visible block and the hour containing the latest.
 */
export function resolveGridSpec(
  items: readonly CalendarItem[],
  days: readonly LocalDate[],
  timezone: IanaTimeZone,
  base: GridSpec = DEFAULT_GRID_SPEC,
  snapMinutes?: SnapMinutes,
): GridSpec {
  const visible = new Set<string>(days);
  let start = base.dayStartMinutes;
  let end = base.dayEndMinutes;

  for (const item of items) {
    if (item.allDay) continue;
    for (const part of splitByLocalDay(item.startAt, item.endAt, timezone)) {
      if (!visible.has(part.date)) continue;
      start = Math.min(start, Math.floor(part.startMinutes / 60) * 60);
      end = Math.max(end, Math.ceil(part.endMinutes / 60) * 60);
    }
  }

  return {
    ...base,
    dayStartMinutes: Math.max(0, start),
    dayEndMinutes: Math.min(1440, Math.max(end, start + 60)),
    snapMinutes: snapMinutes ?? base.snapMinutes,
  };
}

/**
 * Where the grid opens: an hour above the earliest block start on the range,
 * never later than 08:00. Block starts, not segments, so the midnight tail of
 * an overnight block does not open the week at the top of the grid.
 */
export function initialScrollMinutes(
  items: readonly CalendarItem[],
  days: readonly LocalDate[],
  timezone: IanaTimeZone,
  spec: GridSpec,
): Minutes {
  const visible = new Set<string>(days);
  let earliest: Minutes | null = null;

  for (const item of items) {
    if (item.allDay) continue;
    if (!visible.has(localDateOf(item.startAt, timezone))) continue;
    const startMinutes = minutesFromMidnight(item.startAt, timezone);
    earliest = earliest === null ? startMinutes : Math.min(earliest, startMinutes);
  }

  const target = earliest === null ? 8 * 60 : Math.min(8 * 60, earliest - 60);
  return Math.min(Math.max(target, spec.dayStartMinutes), spec.dayEndMinutes);
}

/** Day headers, resolved for display. `today` comes from the server, per request. */
export function buildDays(days: readonly LocalDate[], today: LocalDate): CalendarDay[] {
  return days.map((date) => ({
    date,
    weekdayLabel: formatLocalDate(date, "weekday"),
    dayOfMonthLabel: formatLocalDate(date, "dayOfMonth"),
    isToday: date === today,
  }));
}

/**
 * Splits every timed item into per-day segments within the displayed range and
 * lays out overlaps per day. All-day items are excluded; they render in their own strip.
 */
export function buildSegments(
  items: readonly CalendarItem[],
  days: readonly LocalDate[],
  timezone: IanaTimeZone,
  /** Must come from `resolveGridSpec` over the same items, or a block outside it is clipped away. */
  spec: GridSpec,
): Map<string, ItemSegment[]> {
  const byDate = new Map<string, ItemSegment[]>();
  for (const date of days) byDate.set(date, []);

  for (const item of items) {
    if (item.allDay) continue;
    const parts = splitByLocalDay(item.startAt, item.endAt, timezone);

    parts.forEach((part, index) => {
      const bucket = byDate.get(part.date);
      if (!bucket) return;

      const startMinutes = clamp(part.startMinutes, spec.dayStartMinutes, spec.dayEndMinutes);
      const endMinutes = clamp(part.endMinutes, spec.dayStartMinutes, spec.dayEndMinutes);
      // Only a degenerate row lands here; `resolveGridSpec` over the same items
      // already grew the window to fit every block.
      if (endMinutes <= startMinutes) return;

      bucket.push({
        key: `${item.id}:${part.date}`,
        item,
        date: part.date,
        startMinutes,
        endMinutes,
        isStart: index === 0,
        isEnd: index === parts.length - 1,
        column: 0,
        columns: 1,
      });
    });
  }

  for (const [date, segments] of byDate) {
    const placement = layoutOverlaps(
      segments.map((segment) => ({
        id: segment.key,
        start: segment.startMinutes,
        // Lay out on the rendered height, so short blocks close together sit side by side.
        end: Math.max(segment.endMinutes, segment.startMinutes + MIN_RENDERED_MINUTES),
      })),
    );
    byDate.set(
      date,
      segments.map((segment) => {
        const place = placement.get(segment.key);
        return place ? { ...segment, column: place.column, columns: place.columns } : segment;
      }),
    );
  }

  return byDate;
}

/** All-day items, bucketed by the days they cover. */
export function buildAllDay(
  items: readonly CalendarItem[],
  days: readonly LocalDate[],
  timezone: IanaTimeZone,
): Map<string, CalendarItem[]> {
  const byDate = new Map<string, CalendarItem[]>();
  for (const date of days) byDate.set(date, []);

  for (const item of items) {
    if (!item.allDay) continue;
    for (const part of splitByLocalDay(item.startAt, item.endAt, timezone)) {
      byDate.get(part.date)?.push(item);
    }
  }

  return byDate;
}

/**
 * Whether a block has a completion state at all. Events do not; work blocks
 * always do; habit blocks do while recordable or already done. Shared by the
 * pointer control, the keyboard route and Today, so all three agree.
 */
export function isCompletable(item: CalendarItem): boolean {
  if (item.kind === "work") return item.work !== null;
  if (item.kind === "habit") return item.habitRecordable || item.completedAt !== null;
  return false;
}

/**
 * The completion control's label (Domain Rule 13). The board reads the same
 * `completesTask` / `taskCompletedAt` pair to choose which flag to send, so
 * label and effect are decided together.
 */
export function completionLabel(item: CalendarItem): string {
  if (item.kind === "habit") {
    return item.completedAt === null ? "Mark habit done" : "Mark as not done";
  }

  if (item.completedAt === null) {
    return item.work?.completesTask === true ? "Complete task" : "Done with this block";
  }
  return item.work?.taskCompletedAt != null
    ? "Mark as not done and reopen task"
    : "Mark as not done";
}

/**
 * The wall-clock span an item occupies, counted from the day it starts; a
 * midnight-crossing block runs past 1440. Built from day segments, not
 * `startMinutes + durationMinutes(...)`: elapsed and wall-clock minutes differ
 * by an hour on DST days, and callers hand these back to `fromLocal`.
 */
export function spanOf(
  item: Pick<CalendarItem, "startAt" | "endAt">,
  timezone: IanaTimeZone,
): DaySpan {
  const parts = splitByLocalDay(item.startAt, item.endAt, timezone);
  const first = parts[0];
  const last = parts[parts.length - 1];

  // An empty or inverted span produces no segments; it still has a start.
  if (!first || !last) {
    const startMinutes = minutesFromMidnight(item.startAt, timezone);
    return { date: localDateOf(item.startAt, timezone), startMinutes, endMinutes: startMinutes };
  }

  return {
    date: first.date,
    startMinutes: first.startMinutes,
    endMinutes: (parts.length - 1) * MINUTES_PER_DAY + last.endMinutes,
  };
}

/** The accessible name for a block. */
export function itemLabel(item: CalendarItem, timezone: IanaTimeZone): string {
  const kind = item.kind === "work" ? "Work block" : item.kind === "habit" ? "Habit" : "Event";
  const when = item.allDay
    ? `all day ${formatLocalDate(localDateOf(item.startAt, timezone), "medium")}`
    : formatTimeRange(item.startAt, item.endAt, timezone);
  const repeats = item.occurrence === null ? "" : ", repeats";
  return `${item.title}, ${kind}, ${when}${repeats}${stateOf(item)}`;
}

// A block of a completed task is de-emphasised on screen; its accessible name must say so too.
function stateOf(item: CalendarItem): string {
  if (item.completedAt !== null) return ", completed";
  if (item.work?.taskCompletedAt != null) return ", task completed";
  return "";
}

/** The day after the last displayed one — the exclusive end of the window. */
export function rangeEndExclusive(days: readonly LocalDate[]): LocalDate {
  const last = days[days.length - 1];
  if (!last) throw new Error("A displayed range always has at least one day.");
  return addDays(last, 1);
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
