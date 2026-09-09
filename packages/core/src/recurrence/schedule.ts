import type { Recurrence } from "../types/calendar";
import type { LocalDate, Weekday } from "../types/scalars";
import { addDays, diffDays, weekdayOf } from "../time";

/**
 * Which dates a rule selects, in `LocalDate` arithmetic only. Deliberately
 * free of instants: DST enters only when `expand.ts` calls `fromLocal`.
 */

/**
 * The most candidate dates one expansion walks before giving up. A malformed
 * rule truncates to a short list rather than hanging the calendar render.
 */
export const MAX_CANDIDATE_STEPS = 10_000;

/** The inclusive date range expansion cares about, in the series' own timezone. */
export interface CandidateRange {
  from: LocalDate;
  to: LocalDate;
}

/**
 * The dates `recurrence` selects within `range`, ascending. `firstDate` is the
 * series row's own local date: occurrence 1, the week alignment and, when
 * `byWeekday` is null, the weekday. `LocalDate` string order is calendar order.
 */
export function candidateDates(
  recurrence: Recurrence,
  firstDate: LocalDate,
  range: CandidateRange,
): LocalDate[] {
  const interval = normalizeInterval(recurrence.interval);
  const count = normalizeCount(recurrence.count);
  const { until } = recurrence;

  // One cycle is `interval` days, or `interval` weeks with an entry per selected weekday.
  const offsets =
    recurrence.freq === "weekly" ? weekdayOffsets(recurrence.byWeekday, weekdayOf(firstDate)) : [0];
  const cycleDays = recurrence.freq === "weekly" ? interval * 7 : interval;

  // Skip to the cycle the range begins in. `floor` deliberately under-shoots:
  // landing one cycle early costs a few filtered candidates; one late would drop occurrences.
  const gap = diffDays(firstDate, range.from);
  const startCycle = gap > 0 ? Math.floor(gap / cycleDays) : 0;

  const dates: LocalDate[] = [];
  // Every occurrence the rule has ever produced, skipped ones included; this is what `count` counts.
  let index = startCycle * offsets.length;
  let steps = 0;

  for (const date of candidateSequence(firstDate, cycleDays, offsets, startCycle)) {
    steps += 1;
    if (steps > MAX_CANDIDATE_STEPS) break;
    // `count` is a length, not a window: cancelled and out-of-range occurrences consume their slot.
    if (count !== null && index >= count) break;
    if (date > range.to) break;
    if (until !== null && date > until) break;
    if (date >= range.from) dates.push(date);
    index += 1;
  }

  return dates;
}

/**
 * The rule's dates from `startCycle` onwards, forever; every stop condition is
 * the caller's. Strictly increasing, which the caller relies on.
 */
function* candidateSequence(
  firstDate: LocalDate,
  cycleDays: number,
  offsets: readonly number[],
  startCycle: number,
): Generator<LocalDate> {
  for (let cycle = startCycle; ; cycle += 1) {
    const base = cycle * cycleDays;
    for (const offset of offsets) {
      // Measured from `firstDate`, not the previous date, so a long series cannot drift.
      yield addDays(firstDate, base + offset);
    }
  }
}

/**
 * Day offsets from the start of a series week, ascending. A series week runs
 * from `firstDate`, not from the profile's week start: that keeps every offset
 * non-negative and the expansion dependent on nothing but the row. A null or
 * empty `byWeekday` means the weekday of the first occurrence.
 */
function weekdayOffsets(byWeekday: Weekday[] | null, anchor: Weekday): number[] {
  const selected = byWeekday === null || byWeekday.length === 0 ? [anchor] : byWeekday;
  // Deduplicated: a repeated weekday would produce two rows sharing an occurrence id.
  const offsets = new Set(selected.map((weekday) => (((weekday - anchor) % 7) + 7) % 7));
  return [...offsets].sort((a, b) => a - b);
}

/** `interval` comes from `jsonb`; zero, negative or non-finite values are read as "every". */
function normalizeInterval(interval: number): number {
  if (!Number.isFinite(interval)) return 1;
  return Math.max(1, Math.floor(interval));
}

/** A count of 0 is honoured: a series with no occurrences. */
function normalizeCount(count: number | null): number | null {
  if (count === null || !Number.isFinite(count)) return null;
  return Math.max(0, Math.floor(count));
}
