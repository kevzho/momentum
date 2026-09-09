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
 * The interval arithmetic every planning question is built on.
 *
 * Capacity, the four warnings and Find Time all reduce to the same few
 * operations — turn a day's working windows into instants, turn the blocks
 * into busy intervals, subtract one from the other, measure what is left — so
 * they live here once, and the modules above are the questions rather than
 * the arithmetic.
 *
 * Everything below works in **instants** and measures in **elapsed** minutes.
 * That is deliberate: a working window of 09:00–17:00 is eight hours on every
 * day of the year, but a block placed across a DST transition is an hour
 * longer or shorter than its clock reading, and the only representation in
 * which "how much of the week is left" comes out right is the one that adds up
 * real time (Domain Rule 3, docs/ARCHITECTURE.md §10). Wall clock enters at the
 * edges only: windows are converted with `fromLocal`, and a result is read back
 * with `toDayInterval` / `slotOf` for the grid and for the actions.
 */

/**
 * A leftover gap shorter than this is not somewhere a person can do anything;
 * Find Time's fragmentation criterion counts these, and nothing else in the
 * product should invent a second threshold.
 */
export const MIN_USEFUL_GAP_MINUTES: Minutes = 30;

const MINUTES_PER_DAY: Minutes = 1440;

/* -------------------------------------------------------------------------- */
/* Instants                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Instants are canonical `YYYY-MM-DDTHH:mm:ss.sssZ` strings, so string order
 * is time order. This is written out once so a reader does not have to know
 * that to trust a `<` elsewhere.
 */
export function compareInstants(a: Instant, b: Instant): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function earlierInstant(a: Instant, b: Instant): Instant {
  return a <= b ? a : b;
}

export function laterInstant(a: Instant, b: Instant): Instant {
  return a >= b ? a : b;
}

/* -------------------------------------------------------------------------- */
/* Intervals                                                                  */
/* -------------------------------------------------------------------------- */

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

/**
 * Sorts by start and coalesces anything that overlaps or touches, dropping
 * empty and inverted members. The result is the canonical form every other
 * function here expects of a busy list: ordered, disjoint, non-empty.
 */
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

/**
 * `base` minus `holes`: the parts of the base intervals no hole covers, in
 * start order. Neither input needs to be sorted or disjoint.
 *
 * This is the whole of "free time": the working windows minus the busy
 * intervals. It is also how the fragmentation criterion sees what a candidate
 * would leave behind, by subtracting the candidate from the window it sits in.
 */
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

/* -------------------------------------------------------------------------- */
/* Days and windows                                                           */
/* -------------------------------------------------------------------------- */

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
 * Wall-clock windows on a given day, as instants.
 *
 * Each edge goes through `fromLocal`, so a window over a DST gap is shorter
 * in elapsed time than it reads and one over an overlap is longer — which is
 * what a working window *is* on those days: the hours the clock shows. A
 * window whose edges resolve out of order (both inside a gap) is dropped.
 * Overlapping windows are merged, so a duplicated row in the settings does not
 * double the day's capacity.
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

/* -------------------------------------------------------------------------- */
/* Commitments                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Whether a block claims time on the calendar.
 *
 * Domain Rule 13: an unexecuted block of a completed task stays on the board
 * as settled and is free time to capacity and Find Time. An all-day item has
 * no span on the grid, and a birthday does not block a working day. Everything
 * else — events, outstanding work, executed work, habit blocks — occupies the
 * time it covers, done or not: an executed block is time that was spent, and
 * the week's planned total should still include it.
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

/* -------------------------------------------------------------------------- */
/* Wall clock ↔ instants                                                      */
/* -------------------------------------------------------------------------- */

/**
 * An interval read off the clock on the day it starts.
 *
 * `endMinutes` is the end instant's own clock reading plus a day per midnight
 * crossed — never `startMinutes + elapsed`, which is the formula Phase 3's and
 * Phase 4's reviews each caught once. A block drawn 01:00–03:00 on a
 * spring-forward morning is 60 elapsed minutes and still ends at 03:00.
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
 * The instants a wall-clock span resolves to — the same rule the server
 * applies in `spanInstants` (`features/calendar/actions.ts`), so a candidate
 * the engine scores is the block the action will write.
 *
 * Both ends go through `fromLocal`. The one span that cannot resolve in order
 * — one straddling the far edge of a spring-forward gap, where the start moves
 * forward further than the end — keeps its drawn length instead.
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
 * boundary. Never earlier than `at`: in a fall-back overlap the first
 * occurrence of a reading can precede an instant in the second, and a slot
 * that started in the past would be the result.
 *
 * The boundary is always resolved through `fromLocal` rather than by handing
 * `at` back when its minute already reads one. `minutesFromMidnight` cannot
 * see the seconds and milliseconds an instant carries, and `now` carries them
 * — 14:30:27.456 reads 870 minutes, which is on the 15-minute grid — so
 * returning it unchanged would give the caller a start no wall-clock span
 * resolves to, and Find Time would drop the whole window it opened. A
 * sub-minute remainder on a boundary minute therefore takes the next
 * increment, which is the first boundary genuinely at or after `at`.
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

  // Both readings resolved behind `at`, so `at` is in the second pass of a
  // fall-back overlap and `fromLocal` handed back the first. The clock and
  // elapsed time run together inside the repeated hour, so stepping forward
  // by the remaining minutes lands on the second occurrence of the boundary.
  return addMinutes(at, snapped - minutes);
}
