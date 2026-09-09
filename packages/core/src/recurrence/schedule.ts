import type { Recurrence } from "../types/calendar";
import type { LocalDate, Weekday } from "../types/scalars";
import { addDays, diffDays, weekdayOf } from "../time";

/**
 * The rule half of expansion: a `Recurrence` plus the date of its first
 * occurrence become the list of dates the series lands on inside a range.
 *
 * Deliberately free of instants. Which *dates* a weekly rule selects is a
 * calendar question with the same answer in every zone, so it is answered here
 * in `LocalDate` arithmetic; only `expand.ts` turns a date into an instant with
 * `fromLocal`, which is where DST enters (Domain Rule 16). Splitting it this way
 * is also what keeps the DST tests readable: nothing below can be wrong about a
 * transition, because nothing below knows one exists.
 *
 * Nothing here is re-exported from `index.ts`. The module's contract is the three
 * functions in `expand.ts` (docs/ARCHITECTURE.md §11); this is its interior.
 */

/**
 * The most candidate dates one expansion will walk before giving up.
 *
 * Because the walk starts at the range rather than at the series' first
 * occurrence (see `startCycle` below), a legitimate call never approaches this:
 * a week-long window of a daily series examines about eight candidates, and a
 * year-long one about 366. Ten thousand is roughly 27 years of daily
 * occurrences past the point where the range begins — reachable only from a
 * malformed rule or a corrupt override date, both of which must degrade to a
 * short list rather than hang the render.
 *
 * Truncating rather than throwing is the deliberate choice: this runs inside a
 * calendar query, and a rule nobody can see is a better failure than a page
 * that will not load.
 */
export const MAX_CANDIDATE_STEPS = 10_000;

/** The inclusive date range expansion cares about, in the series' own timezone. */
export interface CandidateRange {
  from: LocalDate;
  to: LocalDate;
}

/**
 * The dates `recurrence` selects that fall within `range`, ascending.
 *
 * `firstDate` is the local date of the series row itself and anchors
 * everything: it is occurrence 1, the week alignment, and — when `byWeekday`
 * is null — the weekday.
 *
 * `LocalDate`s are compared with `<` and `>` throughout. They are fixed-width
 * `YYYY-MM-DD` strings by construction, so lexicographic order *is* calendar
 * order, and going through `diffDays` for every comparison would only add
 * arithmetic to the same answer.
 */
export function candidateDates(
  recurrence: Recurrence,
  firstDate: LocalDate,
  range: CandidateRange,
): LocalDate[] {
  const interval = normalizeInterval(recurrence.interval);
  const count = normalizeCount(recurrence.count);
  const { until } = recurrence;

  // One cycle is `interval` days, or `interval` weeks with an entry per selected
  // weekday. Daily is the degenerate weekly: one offset, at the anchor itself.
  // `byWeekday` is documented as weekly-only, so a daily rule ignores it.
  const offsets =
    recurrence.freq === "weekly" ? weekdayOffsets(recurrence.byWeekday, weekdayOf(firstDate)) : [0];
  const cycleDays = recurrence.freq === "weekly" ? interval * 7 : interval;

  /**
   * Skip straight to the cycle the range begins in instead of stepping through
   * every occurrence since the series started. A standup created in 2020 and
   * viewed in 2026 is 2,000 occurrences of pure waste otherwise, and the
   * iteration cap would have to be loosened far enough to stop guarding
   * anything.
   *
   * `floor` deliberately under-shoots: a cycle spans up to seven days, so the
   * cycle containing `range.from` may have started before it. Landing one cycle
   * early costs a handful of filtered candidates; landing one late would drop
   * real occurrences.
   */
  const gap = diffDays(firstDate, range.from);
  const startCycle = gap > 0 ? Math.floor(gap / cycleDays) : 0;

  const dates: LocalDate[] = [];
  // Every occurrence the rule has ever produced, including the ones this call
  // skipped over and the ones the range excludes — this is what `count` counts.
  let index = startCycle * offsets.length;
  let steps = 0;

  for (const date of candidateSequence(firstDate, cycleDays, offsets, startCycle)) {
    steps += 1;
    if (steps > MAX_CANDIDATE_STEPS) break;
    // `count` is a length, not a window: a cancelled occurrence and one the
    // caller never asked for both consume their slot. Otherwise deleting a
    // single occurrence would silently extend the series by a week, and paging
    // the calendar forward would change where it ends.
    if (count !== null && index >= count) break;
    if (date > range.to) break;
    if (until !== null && date > until) break;
    if (date >= range.from) dates.push(date);
    index += 1;
  }

  return dates;
}

/**
 * The rule's dates from `startCycle` onwards, forever.
 *
 * Infinite on purpose. Every reason to stop — the cap, `count`, `until`, the
 * end of the range — is a property of the caller's question rather than of the
 * rule, and keeping them all in one loop above means a new one cannot be added
 * to five places and forgotten in a sixth.
 *
 * Strictly increasing, which the caller relies on to stop at the first date
 * past its range: offsets are ascending and less than 7, and a cycle is at
 * least 1 day for daily rules and at least 7 for weekly ones.
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
      // Always measured from `firstDate` rather than from the previous date, so
      // a long series cannot accumulate drift.
      yield addDays(firstDate, base + offset);
    }
  }
}

/**
 * Day offsets from the start of a series week, ascending.
 *
 * **Week alignment convention.** A series week runs from the series' own first
 * occurrence: week 0 is `firstDate` … `firstDate + 6`, week 1 begins
 * `interval` weeks later, and so on. It is *not* aligned to the user's Monday-
 * or Sunday-start week (RFC 5545 would call that `WKST`), and it is not
 * aligned to the requested calendar week either.
 *
 * The alternative — anchoring on the profile's week start — makes "every other
 * Monday and Thursday" depend on a display preference the series does not
 * store, and would leave a series that starts on a Wednesday ambiguous about
 * whether the Monday two days earlier belongs to its first week. Anchoring on
 * `firstDate` makes every offset non-negative, so no generated date can precede
 * the series' own start, and makes the expansion depend on nothing but the row.
 *
 * A null `byWeekday` means "the weekday of the first occurrence" (the type's
 * own documentation); an empty array is malformed and is read the same way,
 * because a rule that selects no weekday at all can only be a lossy write.
 */
function weekdayOffsets(byWeekday: Weekday[] | null, anchor: Weekday): number[] {
  const selected = byWeekday === null || byWeekday.length === 0 ? [anchor] : byWeekday;
  // Deduplicated: a repeated weekday would otherwise produce two occurrences on
  // one date, and therefore two rows sharing an occurrence id.
  const offsets = new Set(selected.map((weekday) => (((weekday - anchor) % 7) + 7) % 7));
  return [...offsets].sort((a, b) => a - b);
}

/**
 * `interval` reaches us from a `jsonb` column, so it can be anything a bad
 * write left behind. Zero or a negative step would never advance the sequence
 * and a non-finite one would poison the date arithmetic into `Invalid Date`;
 * both are read as "every", which is the only interpretation that still
 * produces a usable calendar.
 */
function normalizeInterval(interval: number): number {
  if (!Number.isFinite(interval)) return 1;
  return Math.max(1, Math.floor(interval));
}

/** Same defensiveness for `count`. A count of 0 is honoured: a series with no occurrences. */
function normalizeCount(count: number | null): number | null {
  if (count === null || !Number.isFinite(count)) return null;
  return Math.max(0, Math.floor(count));
}
