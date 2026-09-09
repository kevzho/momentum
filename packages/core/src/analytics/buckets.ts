import { addDays, localDateOf, minutesFromMidnight, weekOf } from "../time";
import type { IanaTimeZone, Instant, LocalDate, Minutes, Weekday } from "../types/scalars";

/**
 * Every bucketing decision in one file: by local day, local week and local
 * hour, all in the profile timezone. Hour is a wall-clock reading, so on a
 * fall-back day the repeated hour receives both passes.
 */

/** A bucket keyed by local date, with its summed value. */
export interface DayValue {
  date: LocalDate;
  value: number;
}

/** A bucket keyed by hour of the local clock, `0`–`23`. */
export interface HourValue {
  hour: number;
  value: number;
}

/** A bucket keyed by day of the week, in the user's own week order. */
export interface WeekdayValue {
  weekday: Weekday;
  value: number;
  /** How many observations produced `value`. */
  count: number;
}

/** The 24 hours of a local day, as an axis. */
export const HOURS_OF_DAY: readonly number[] = Array.from({ length: 24 }, (_, hour) => hour);

/** The local date an instant belongs to. */
export function dayBucket(at: Instant, timezone: IanaTimeZone): LocalDate {
  return localDateOf(at, timezone);
}

/** The start date of the local week an instant belongs to, for the user's `weekStart`. */
export function weekBucket(at: Instant, timezone: IanaTimeZone, weekStart: Weekday): LocalDate {
  return weekOf(localDateOf(at, timezone), weekStart).start;
}

/** The hour the local clock read, `0`–`23`. */
export function hourBucket(at: Instant, timezone: IanaTimeZone): number {
  return Math.floor(minutesFromMidnight(at, timezone) / 60);
}

/**
 * Sums `amountOf` into one bucket per key in `keys`, in `keys` order. Empty
 * buckets are kept at zero; an item whose key is not in `keys` is ignored.
 */
export function sumInto<K extends string | number, T>(
  keys: readonly K[],
  items: readonly T[],
  keyOf: (item: T) => K | null,
  amountOf: (item: T) => number,
): Map<K, number> {
  const totals = new Map<K, number>();
  for (const key of keys) totals.set(key, 0);

  for (const item of items) {
    const key = keyOf(item);
    if (key === null) continue;
    const current = totals.get(key);
    if (current === undefined) continue;
    totals.set(key, current + amountOf(item));
  }

  return totals;
}

/** `sumInto` shaped as the day series a chart consumes. */
export function daySeries<T>(
  days: readonly LocalDate[],
  items: readonly T[],
  keyOf: (item: T) => LocalDate | null,
  amountOf: (item: T) => number,
): DayValue[] {
  const totals = sumInto(days, items, keyOf, amountOf);
  return days.map((date) => ({ date, value: totals.get(date) ?? 0 }));
}

/** `sumInto` shaped as the 24-hour series a chart consumes. */
export function hourSeries<T>(
  items: readonly T[],
  keyOf: (item: T) => number | null,
  amountOf: (item: T) => number,
): HourValue[] {
  const totals = sumInto(HOURS_OF_DAY, items, keyOf, amountOf);
  return HOURS_OF_DAY.map((hour) => ({ hour, value: totals.get(hour) ?? 0 }));
}

/** Minutes summed per weekday, with the number of observations behind each (the insight's sample size). */
export function weekdaySeries<T>(
  items: readonly T[],
  weekdayOfItem: (item: T) => Weekday | null,
  amountOf: (item: T) => Minutes,
): WeekdayValue[] {
  const buckets: WeekdayValue[] = Array.from({ length: 7 }, (_, index) => ({
    weekday: index as Weekday,
    value: 0,
    count: 0,
  }));

  for (const item of items) {
    const weekday = weekdayOfItem(item);
    if (weekday === null) continue;
    const bucket = buckets[weekday];
    if (bucket === undefined) continue;
    bucket.value += amountOf(item);
    bucket.count += 1;
  }

  return buckets;
}

/** One week of a period: where it starts, and which of its seven days the period covers. */
export interface PeriodWeek {
  start: LocalDate;
  /** Exactly seven entries, week-start first; `null` where the day falls outside the period. */
  days: (LocalDate | null)[];
}

/** A period's days grouped into the user's own weeks: the shape a consistency grid is drawn from. */
export function weeksOfPeriod(days: readonly LocalDate[], weekStart: Weekday): PeriodWeek[] {
  const first = days.at(0);
  const last = days.at(-1);
  if (first === undefined || last === undefined) return [];

  const covered = new Set<string>(days);
  const weeks: PeriodWeek[] = [];

  for (let start = weekOf(first, weekStart).start; start <= last; start = addDays(start, 7)) {
    weeks.push({
      start,
      days: Array.from({ length: 7 }, (_, offset) => {
        const date = addDays(start, offset);
        return covered.has(date) ? date : null;
      }),
    });
  }

  return weeks;
}
