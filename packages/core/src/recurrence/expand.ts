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
 * Query-time expansion of recurring events; occurrences are never
 * materialized. Wall-clock time is what repeats: each occurrence is built with
 * `fromLocal` in the series timezone, so a 09:00 class stays at 09:00 across DST.
 */

/** The half-open UTC window `[start, end)` an expansion is asked for. */
export interface ExpansionWindow {
  start: Instant;
  end: Instant;
}

/** Used only to size a margin, never to measure a day. */
const NOMINAL_DAY_MINUTES = 1_440;

/** Stable identity: the series and the date the rule produced, not the date an override moved it to. */
export function occurrenceId(seriesId: Uuid, occurrenceDate: LocalDate): string {
  return `${seriesId}:${occurrenceDate}`;
}

/**
 * Expands one series into the occurrences that intersect `window`. `overrides`
 * may contain other series' rows; they are filtered by `seriesId`. A block
 * with no `recurrence` yields nothing.
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
  // Elapsed minutes: an occurrence across a DST transition keeps its length and
  // moves its end wall-clock time, rather than silently shrinking or growing.
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
    // A cancelled override has already consumed its `count` slot in `candidateDates`.
    if (override !== null && override.cancelled) continue;

    const startAt =
      override === null ? fromLocal(occurrenceDate, firstMinutes, timezone) : override.startAt;
    const endAt = override === null ? addMinutes(startAt, duration) : override.endAt;

    // Half-open on the window, so paging never shows the same block twice.
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

/** Expands every series into one list ordered by start time; rows without a `recurrence` are skipped. */
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

// Ordering is part of the output: without it the grid would reorder whenever an
// unrelated row changed. `Instant` is canonical fixed-width UTC, so `<` is chronological.
function byStartThenId(a: Occurrence, b: Occurrence): number {
  if (a.startAt !== b.startAt) return a.startAt < b.startAt ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/** This series' overrides keyed by occurrence date; first wins, so an optimistic duplicate cannot make the result depend on array order. */
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
 * The dates worth generating, in the series' timezone. Wider than the window:
 * one day for the user/series timezone gap, the series' own duration for
 * multi-day occurrences, and every override date so a moved occurrence is
 * judged on its new times.
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
