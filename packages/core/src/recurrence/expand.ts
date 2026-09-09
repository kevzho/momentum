import type { EventBlock, Occurrence } from "../types/calendar";
import type { IanaTimeZone, Instant, LocalDate, Minutes, Uuid } from "../types/scalars";
import {
  addDays,
  addMinutes,
  durationMinutes,
  fromLocal,
  localDateOf,
  minutesFromMidnight,
} from "../time";
import { candidateDates, type CandidateRange } from "./schedule";

/**
 * Query-time expansion of recurring events (Domain Rule 16,
 * docs/ARCHITECTURE.md §11).
 *
 * Occurrences are never materialized. A series is one row carrying its rule and
 * the timezone the schedule was written in; asking for a week runs the rule
 * over that week and applies whatever override rows the same query returned.
 * Nothing here reads a clock, so two calls with the same arguments are the same
 * list — which is what lets the server and the client render identical markup
 * from identical rows.
 *
 * **Wall-clock, not elapsed time, is what repeats.** Each occurrence is built
 * with `fromLocal(date, firstMinutes, r.timezone)`, so a 09:00 class is at
 * 09:00 on both sides of a DST transition even though its UTC instant moves by
 * an hour. Adding 7 × 24h to the previous instant would drift the class to
 * 08:00 or 10:00 for half the year; that is the entire reason the series stores
 * a timezone.
 */

/** The half-open UTC window `[start, end)` an expansion is asked for. */
export interface ExpansionWindow {
  start: Instant;
  end: Instant;
}

/** Minutes in an ordinary day. Used only to size a margin, never to measure one. */
const NOMINAL_DAY_MINUTES = 1_440;

/**
 * The stable identity of an occurrence: its series and the date it belongs to.
 *
 * The occurrence date is the one the *rule* produced, not the one an override
 * may have moved it to, so React keys and optimistic state survive a user
 * dragging an occurrence to another day.
 */
export function occurrenceId(seriesId: Uuid, occurrenceDate: LocalDate): string {
  return `${seriesId}:${occurrenceDate}`;
}

/**
 * Expands one series into the occurrences that intersect `window`.
 *
 * `overrides` may contain rows belonging to other series; they are filtered by
 * `seriesId`, so a caller can hand the whole result of the week query to every
 * series without partitioning it first.
 *
 * A block with no `recurrence` yields nothing. The window query keeps plain
 * rows and series rows apart, so this only happens when a caller mixes them by
 * mistake, and returning an empty list keeps that mistake from turning into a
 * duplicated block on the grid.
 */
export function expandSeries(
  series: EventBlock,
  window: ExpansionWindow,
  overrides: readonly EventBlock[],
): Occurrence[] {
  const rule = series.recurrence;
  if (rule === null) return [];

  const timezone = rule.timezone;
  const firstDate = localDateOf(series.startAt, timezone);
  const firstMinutes = minutesFromMidnight(series.startAt, timezone);
  // Elapsed minutes, taken once from the series row. An occurrence that spans a
  // transition therefore keeps its length and moves its *end* wall-clock time:
  // a 2-hour block starting 01:00 on a spring-forward morning ends at 04:00
  // local, not 03:00. Recurring the end time independently would instead
  // silently turn that block into a 1-hour one, and the whole product treats a
  // block's length as the amount of the user's week it consumes (Domain Rule 3).
  const duration = durationMinutes(series.startAt, series.endAt);

  const overridesByDate = indexOverrides(series.id, overrides);
  const dates = candidateDates(
    rule,
    firstDate,
    candidateRange(window, timezone, duration, overridesByDate),
  );

  const occurrences: Occurrence[] = [];
  for (const occurrenceDate of dates) {
    const override = overridesByDate.get(occurrenceDate) ?? null;
    // A cancelled override deletes its occurrence but has already consumed its
    // slot in `count` inside `candidateDates` — deleting one occurrence must
    // not extend the series by another.
    if (override !== null && override.cancelled) continue;

    const startAt =
      override === null ? fromLocal(occurrenceDate, firstMinutes, timezone) : override.startAt;
    const endAt = override === null ? addMinutes(startAt, duration) : override.endAt;

    // Half-open on the window: a block ending exactly at the window's start
    // belongs to the previous week and one starting exactly at its end to the
    // next, so paging the calendar never shows the same block twice.
    if (!(startAt < window.end && endAt > window.start)) continue;

    occurrences.push({
      id: occurrenceId(series.id, occurrenceDate),
      seriesId: series.id,
      occurrenceDate,
      startAt,
      endAt,
      series,
      override,
    });
  }

  return occurrences.sort(byStartThenId);
}

/**
 * Expands every series into one list ordered by start time.
 *
 * Rows without a `recurrence` are skipped rather than passed through, so the
 * caller can pour an unfiltered set of event blocks in: plain events come back
 * from the same query and belong on the grid as themselves, not as occurrences.
 */
export function expandAll(
  series: readonly EventBlock[],
  window: ExpansionWindow,
  overrides: readonly EventBlock[],
): Occurrence[] {
  const occurrences: Occurrence[] = [];
  for (const row of series) {
    if (row.recurrence === null) continue;
    occurrences.push(...expandSeries(row, window, overrides));
  }
  return occurrences.sort(byStartThenId);
}

/**
 * Ordering is part of the output, not an accident of the algorithm: an override
 * can move an occurrence anywhere, and `expandAll` interleaves series, so
 * without a sort the list would reshuffle whenever an unrelated row changed and
 * the grid would reorder underneath the user. The id tiebreak keeps two
 * occurrences that start at the same instant in a fixed order.
 *
 * `Instant`s compare correctly with `<`: every one is the canonical fixed-width
 * `YYYY-MM-DDTHH:mm:ss.sssZ` UTC spelling that `instant()` produces, so
 * lexicographic order is chronological order.
 */
function byStartThenId(a: Occurrence, b: Occurrence): number {
  if (a.startAt !== b.startAt) return a.startAt < b.startAt ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/**
 * The overrides belonging to this series, keyed by the occurrence they replace.
 *
 * The database has a unique index on `(series_id, occurrence_date)`, so the
 * first-wins rule below is unreachable in practice; it exists so that a
 * duplicate arriving from an optimistic client cannot make the rendered week
 * depend on array order.
 */
function indexOverrides(
  seriesId: Uuid,
  overrides: readonly EventBlock[],
): Map<LocalDate, EventBlock> {
  const byDate = new Map<LocalDate, EventBlock>();
  for (const override of overrides) {
    if (override.seriesId !== seriesId || override.occurrenceDate === null) continue;
    if (!byDate.has(override.occurrenceDate)) byDate.set(override.occurrenceDate, override);
  }
  return byDate;
}

/**
 * The dates worth generating for this window, in the series' timezone.
 *
 * Wider than the window on both sides, for three reasons:
 *
 * - The window's bounds are instants chosen in the *user's* timezone; the rule
 *   selects dates in the *series'*. A window that starts at Monday 00:00 in one
 *   zone starts partway through Sunday or Monday in another, so the day before
 *   the window's first local date can still hold an occurrence that reaches
 *   into it. This is step 2's one-day margin.
 * - An occurrence longer than a day starts that many days earlier still. The
 *   margin is sized from the series' own duration rather than assumed, so an
 *   overnight shift or a three-day conference is not silently dropped from
 *   every week but its first.
 * - An override may move an occurrence, and the moved times are what decides
 *   whether it belongs in the window. Every override date this series owns is
 *   therefore inside the range, however far outside the window it sits, so a
 *   moved occurrence is considered and then judged on its new times.
 *
 * The trailing margin is pure belt-and-braces: an occurrence whose date is past
 * the window's last local date cannot start before the window ends. It costs
 * one filtered candidate and removes the need to prove that at the call site.
 */
function candidateRange(
  window: ExpansionWindow,
  timezone: IanaTimeZone,
  duration: Minutes,
  overridesByDate: ReadonlyMap<LocalDate, EventBlock>,
): CandidateRange {
  const leadDays = 1 + Math.max(0, Math.ceil(duration / NOMINAL_DAY_MINUTES));
  let from = addDays(localDateOf(window.start, timezone), -leadDays);
  let to = addDays(localDateOf(window.end, timezone), 1);

  for (const date of overridesByDate.keys()) {
    if (date < from) from = date;
    if (date > to) to = date;
  }

  return { from, to };
}
