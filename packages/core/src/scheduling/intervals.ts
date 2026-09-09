import type { IanaTimeZone, Instant, LocalDate, Minutes, TimeWindow, WorkingHours } from "../types";
import {
  addDays,
  addMinutes,
  diffDays,
  durationMinutes,
  endOfDay,
  fromLocal,
  localDateOf,
  minutesFromMidnight,
  minutesOfLocalTime,
  startOfDay,
  weekdayOf,
} from "../time";
import type { Commitment, DayInterval, InstantInterval, SlotSpan } from "./types";

/**
 * Interval arithmetic for every planning question. Everything works in
 * instants and measures elapsed minutes; wall clock enters only at the edges
 * (`fromLocal` in, `toDayInterval` / `slotOf` out).
 */

/** A leftover gap shorter than this counts as a fragment in Find Time. The one threshold; do not invent another. */
export const MIN_USEFUL_GAP_MINUTES: Minutes = 30;

const MINUTES_PER_DAY: Minutes = 1440;

/** Instants are canonical fixed-width UTC strings, so string order is time order. */
export function compareInstants(a: Instant, b: Instant): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function earlierInstant(a: Instant, b: Instant): Instant {
  return a <= b ? a : b;
}

export function laterInstant(a: Instant, b: Instant): Instant {
  return a >= b ? a : b;
}

/** Elapsed minutes; never negative, so an inverted interval simply counts for nothing. */
export function intervalMinutes(interval: InstantInterval): Minutes {
  return Math.max(0, durationMinutes(interval.startAt, interval.endAt));
}

/** Strict on both sides: touching intervals do not overlap, and an empty one overlaps nothing. */
export function intervalsOverlap(a: InstantInterval, b: InstantInterval): boolean {
  return a.startAt < b.endAt && b.startAt < a.endAt;
}

/** The common part of two intervals, or null when they do not overlap. */
export function intersectIntervals(a: InstantInterval, b: InstantInterval): InstantInterval | null {
  const startAt = laterInstant(a.startAt, b.startAt);
  const endAt = earlierInstant(a.endAt, b.endAt);
  return startAt < endAt ? { startAt, endAt } : null;
}

/** Sorts and coalesces overlapping or touching intervals, dropping empty and inverted ones: ordered, disjoint, non-empty. */
export function mergeIntervals(intervals: readonly InstantInterval[]): InstantInterval[] {
  const ordered = intervals
    .filter((interval) => interval.startAt < interval.endAt)
    .slice()
    .sort((a, b) => compareInstants(a.startAt, b.startAt) || compareInstants(a.endAt, b.endAt));

  const merged: InstantInterval[] = [];
  for (const interval of ordered) {
    const last = merged[merged.length - 1];
    if (last !== undefined && interval.startAt <= last.endAt) {
      if (interval.endAt > last.endAt) last.endAt = interval.endAt;
    } else {
      merged.push({ startAt: interval.startAt, endAt: interval.endAt });
    }
  }
  return merged;
}

/** `base` minus `holes`, in start order. Neither input needs to be sorted or disjoint. */
export function subtractIntervals(
  base: readonly InstantInterval[],
  holes: readonly InstantInterval[],
): InstantInterval[] {
  const cut = mergeIntervals(holes);
  const free: InstantInterval[] = [];

  for (const interval of mergeIntervals(base)) {
    let cursor = interval.startAt;
    for (const hole of cut) {
      if (hole.endAt <= cursor) continue;
      if (hole.startAt >= interval.endAt) break;
      if (hole.startAt > cursor) free.push({ startAt: cursor, endAt: hole.startAt });
      cursor = laterInstant(cursor, hole.endAt);
      if (cursor >= interval.endAt) break;
    }
    if (cursor < interval.endAt) free.push({ startAt: cursor, endAt: interval.endAt });
  }

  return free;
}

/** Total elapsed minutes of a set of intervals, after merging so overlaps are not double-counted. */
export function totalMinutes(intervals: readonly InstantInterval[]): Minutes {
  return mergeIntervals(intervals).reduce((sum, interval) => sum + intervalMinutes(interval), 0);
}

/** The intersection of every base interval with `bounds`, in start order. */
export function clipIntervals(
  intervals: readonly InstantInterval[],
  bounds: InstantInterval,
): InstantInterval[] {
  const clipped: InstantInterval[] = [];
  for (const interval of intervals) {
    const part = intersectIntervals(interval, bounds);
    if (part !== null) clipped.push(part);
  }
  return clipped;
}

/** The half-open instants of one local day, 23 or 25 hours long on a transition day. */
export function dayBounds(date: LocalDate, tz: IanaTimeZone): InstantInterval {
  return { startAt: startOfDay(date, tz), endAt: endOfDay(date, tz) };
}

/** The half-open instants of a run of local days. Empty for an empty run. */
export function rangeBounds(days: readonly LocalDate[], tz: IanaTimeZone): InstantInterval | null {
  const first = days[0];
  const last = days[days.length - 1];
  if (first === undefined || last === undefined) return null;
  return { startAt: startOfDay(first, tz), endAt: startOfDay(addDays(last, 1), tz) };
}

/**
 * Wall-clock windows on a day, as instants. A window over a DST gap is shorter
 * in elapsed time than it reads; one whose edges resolve out of order is
 * dropped. Overlapping windows are merged.
 */
export function windowIntervalsOn(
  date: LocalDate,
  windows: readonly TimeWindow[],
  tz: IanaTimeZone,
): DayInterval[] {
  const intervals: InstantInterval[] = [];
  for (const window of windows) {
    const startAt = fromLocal(date, minutesOfLocalTime(window.start), tz);
    const endAt = fromLocal(date, minutesOfLocalTime(window.end), tz);
    if (startAt < endAt) intervals.push({ startAt, endAt });
  }
  return mergeIntervals(intervals).map((interval) => toDayInterval(interval, tz));
}

/** The configured working windows of the weekday `date` falls on. Empty on a day off. */
export function workingIntervalsOn(
  date: LocalDate,
  workingHours: WorkingHours,
  tz: IanaTimeZone,
): DayInterval[] {
  return windowIntervalsOn(date, workingHours[weekdayOf(date)], tz);
}

/** The preferred focus windows, which apply to every day alike. */
export function focusIntervalsOn(
  date: LocalDate,
  focusWindows: readonly TimeWindow[],
  tz: IanaTimeZone,
): DayInterval[] {
  return windowIntervalsOn(date, focusWindows, tz);
}

/**
 * Whether a block claims time. An all-day item does not; nor does an
 * unexecuted block of a completed task (Domain Rule 13). An executed block
 * still does: the time was spent.
 */
export function occupiesTime(commitment: Commitment): boolean {
  if (commitment.allDay) return false;
  if (commitment.taskCompletedAt !== null && commitment.completedAt === null) return false;
  return commitment.startAt < commitment.endAt;
}

/** The commitments that occupy time, as merged, ordered busy intervals. */
export function busyIntervals(commitments: readonly Commitment[]): InstantInterval[] {
  return mergeIntervals(
    commitments
      .filter(occupiesTime)
      .map((commitment) => ({ startAt: commitment.startAt, endAt: commitment.endAt })),
  );
}

/** The commitments that occupy time and overlap an interval, in start order. */
export function commitmentsOverlapping(
  commitments: readonly Commitment[],
  interval: InstantInterval,
): Commitment[] {
  return commitments
    .filter((commitment) => occupiesTime(commitment) && intervalsOverlap(commitment, interval))
    .sort(
      (a, b) => compareInstants(a.startAt, b.startAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

/**
 * An interval read off the clock on the day it starts. `endMinutes` is the end
 * instant's own clock reading plus a day per midnight crossed, never
 * `startMinutes + elapsed`: a 01:00–03:00 block on a spring-forward morning is
 * 60 elapsed minutes and still ends at 03:00.
 */
export function toDayInterval(interval: InstantInterval, tz: IanaTimeZone): DayInterval {
  const date = localDateOf(interval.startAt, tz);
  const endDate = localDateOf(interval.endAt, tz);
  return {
    startAt: interval.startAt,
    endAt: interval.endAt,
    date,
    startMinutes: minutesFromMidnight(interval.startAt, tz),
    endMinutes: minutesFromMidnight(interval.endAt, tz) + diffDays(date, endDate) * MINUTES_PER_DAY,
  };
}

/** The wall-clock span a calendar action takes, from an interval. */
export function slotOf(interval: InstantInterval, tz: IanaTimeZone): SlotSpan {
  const day = toDayInterval(interval, tz);
  return { date: day.date, startMinutes: day.startMinutes, endMinutes: day.endMinutes };
}

/**
 * The instants a wall-clock span resolves to; must match `spanInstants` in
 * `features/calendar/actions.ts`. A span that cannot resolve in order (the far
 * edge of a spring-forward gap) keeps its drawn length instead.
 */
export function intervalOfSlot(slot: SlotSpan, tz: IanaTimeZone): InstantInterval {
  const startAt = fromLocal(slot.date, slot.startMinutes, tz);
  const endAt = fromLocal(slot.date, slot.endMinutes, tz);
  return endAt > startAt
    ? { startAt, endAt }
    : { startAt, endAt: addMinutes(startAt, slot.endMinutes - slot.startMinutes) };
}

/**
 * The first instant at or after `at` whose clock reading sits on a snap
 * boundary; never earlier than `at`. Always resolved through `fromLocal`,
 * never `at` itself: `at` may carry seconds (14:30:27 reads as 870 minutes),
 * and a start no wall-clock span resolves to would make Find Time drop the window.
 */
export function snapInstantUp(at: Instant, snapMinutes: Minutes, tz: IanaTimeZone): Instant {
  const step = Math.max(1, Math.round(snapMinutes));
  const date = localDateOf(at, tz);
  const minutes = minutesFromMidnight(at, tz);
  const snapped = Math.ceil(minutes / step) * step;

  const candidate = fromLocal(date, snapped, tz);
  if (candidate >= at) return candidate;
  if (snapped === minutes) {
    const next = fromLocal(date, snapped + step, tz);
    if (next >= at) return next;
  }

  // Both readings resolved behind `at`: it is in the second pass of a fall-back
  // overlap. Stepping forward by the remaining minutes lands on the second boundary.
  return addMinutes(at, snapped - minutes);
}
