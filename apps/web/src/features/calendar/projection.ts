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
 * The projection from domain objects onto the grid's coordinate system.
 *
 * Everything above this module works in instants; everything below it works in
 * wall-clock minutes on a named day. This is the only place the two meet, which
 * is why the timezone appears here and nowhere in the rendering or interaction
 * code (Domain Rule 5).
 */

/**
 * The colour a block falls back to when it has none of its own and no project
 * to inherit from.
 *
 * The three kinds are already distinguishable without colour — solid rule,
 * outline plus checkbox, dashed plus repeat glyph (docs/DESIGN_SYSTEM.md) — so
 * these only have to be neutral and stable, not carry meaning:
 *
 *   event  slate — an appointment is not the user's work to categorise, and
 *                  slate is what `CalendarBlock` already defaults to
 *   work   blue  — an uncategorised piece of work, in the product's own hue
 *   habit  teal  — a generated commitment reads as a different class of thing
 *                  from a task even when neither has a project
 */
export const KIND_DEFAULT_COLOR: Record<BlockKind, ProjectColor> = {
  event: "slate",
  work: "blue",
  habit: "teal",
};

/** Blocks shorter than this still have to be legible; the grid renders them at a floor height. */
export const MIN_RENDERED_MINUTES: Minutes = 15;

/** Wall clock, always — a DST day is 23 or 25 hours long but still reads 00:00 to 24:00. */
const MINUTES_PER_DAY: Minutes = 1440;

/**
 * The grid's vertical extent for a given set of items.
 *
 * specs/03-weekly-calendar.md asks for "roughly 5:00 AM – 12:00 AM", which is
 * the right default and the wrong hard limit: a 04:30 gym block or a shift
 * ending at 02:00 would simply not be on the calendar, and a scheduling product
 * that hides commitments is worse than one that scrolls. So the window starts
 * at the default and only ever grows, to the hour containing the earliest
 * visible block and the hour containing the latest.
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
 * Where the grid should be scrolled to on arrival.
 *
 * The earliest thing the user actually starts on the week, one hour of context
 * above it, and never later than 08:00 — so a week whose first commitment is a
 * 16:00 lecture still opens on the working day rather than on an empty morning.
 *
 * Block *starts*, not segments: the 00:00 tail of a block that began at 23:30
 * the night before is not a thing the user starts at midnight, and treating it
 * as one would open every week containing an overnight shift at the top of the
 * grid.
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

/** Day headers, resolved for display. `today` comes from the server, per request (§10). */
export function buildDays(days: readonly LocalDate[], today: LocalDate): CalendarDay[] {
  return days.map((date) => ({
    date,
    weekdayLabel: formatLocalDate(date, "weekday"),
    dayOfMonthLabel: formatLocalDate(date, "dayOfMonth"),
    isToday: date === today,
  }));
}

/**
 * Splits every item into per-day segments, drops what the displayed range does
 * not contain, and lays out overlaps column by column.
 *
 * Overlap layout is per day, because two blocks on different days do not
 * overlap however close their clock times are. All-day items are excluded:
 * they render in their own strip, not in the time grid.
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
      // Nothing is dropped in normal use: `resolveGridSpec` is given the same
      // items and grows the window until every one of them fits, which is why
      // the two must be called as a pair. This only catches a degenerate row —
      // one whose start and end resolve to the same minute — where a
      // zero-height sliver would be worse than nothing.
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
        // Lay out on the rendered height, not the true one, so two 15-minute
        // blocks five minutes apart are placed side by side rather than
        // overlapping visually while the maths says they do not.
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
 * Whether a block has a completion state at all (Domain Rule 13).
 *
 * An event does not: nothing was executed, there is nothing to record. A work
 * block always does. A habit block does while its own date is inside the window
 * `record_habit_completion` accepts — yesterday, today or tomorrow in the
 * profile timezone — or while it is already done and the control would undo it.
 *
 * One definition, used by the block's pointer control, its keyboard route and
 * Today's timeline, so all three offer exactly the same action on exactly the
 * same blocks (Domain Rule 10). A control offered where the database would
 * refuse is a promise the product cannot keep.
 */
export function isCompletable(item: CalendarItem): boolean {
  if (item.kind === "work") return item.work !== null;
  if (item.kind === "habit") return item.habitRecordable || item.completedAt !== null;
  return false;
}

/**
 * What a block's completion control will do, said in the control's own words.
 *
 * Domain Rule 13 fixes all four phrasings, and there is exactly one of this
 * function because the label and the effect have to be decided together: the
 * board reads the same `completesTask` / `taskCompletedAt` pair to choose which
 * flag to send, and a second copy of this logic is a second chance for the
 * button to promise something the mutation does not do.
 */
export function completionLabel(item: CalendarItem): string {
  if (item.kind === "habit") {
    // A habit block's control records the habit for the block's own day as
    // well as marking the span executed, and the label says the part the user
    // cares about (Phase 6, Domain Rule 14).
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
 * The wall-clock span an item occupies, counted from the day it starts.
 *
 * Built from the same day segments the grid is, not from
 * `startMinutes + durationMinutes(...)`. That addition mixes two quantities: a
 * wall-clock coordinate and an elapsed count, which agree on 363 days a year
 * and disagree by an hour on the two they do not. A 01:00–05:00 block on a
 * spring-forward date is four hours on the clock and three hours of elapsed
 * time, and the editor and the undo path both need the clock's answer — they
 * are about to hand these minutes back to `fromLocal`, which reads them as
 * wall-clock.
 *
 * A block that crosses midnight keeps counting past 1440 (23:30 to 00:30 ends
 * at 1470), because the span belongs to the day it started on. Wall-clock days
 * are always 1440 minutes wide in this coordinate system, DST or not — that is
 * what makes the multiplication below safe.
 */
export function spanOf(item: CalendarItem, timezone: IanaTimeZone): DaySpan {
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

/**
 * The accessible name for a block: everything a sighted user reads off it,
 * in one string, because a screen reader gets one chance to describe it.
 */
export function itemLabel(item: CalendarItem, timezone: IanaTimeZone): string {
  const kind = item.kind === "work" ? "Work block" : item.kind === "habit" ? "Habit" : "Event";
  const when = item.allDay
    ? `all day ${formatLocalDate(localDateOf(item.startAt, timezone), "medium")}`
    : formatTimeRange(item.startAt, item.endAt, timezone);
  return `${item.title}, ${kind}, ${when}${stateOf(item)}`;
}

/**
 * The two states a block can be in beyond "outstanding", said out loud.
 *
 * "Settled" is the one that is easy to lose: a block of a completed task that
 * was never executed is de-emphasised on screen and, without this, has an
 * accessible name byte-identical to a block that is still work to do
 * (Domain Rule 13). The visual and the name have to agree, or the de-emphasis
 * is information only sighted users get.
 */
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
