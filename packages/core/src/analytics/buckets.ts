import { addDays, localDateOf, minutesFromMidnight, weekOf } from "../time";
import type { IanaTimeZone, Instant, LocalDate, Minutes, Weekday } from "../types/scalars";

/**
 * Every bucketing decision this module makes, in one file.
 *
 * There are exactly three ways an aggregation groups a timestamp — by local
 * day, by local week, by local hour — and each is written once here so that a
 * bug in one of them is one bug rather than six. All three take the timezone as
 * a parameter and none reads an ambient default (Domain Rule 4).
 *
 * The DST behaviour each inherits is the behaviour `@momentum/core/time`
 * already defines, and it is correct in a way worth stating:
 *
 * - **Day.** `localDateOf` asks the timezone which date an instant falls on, so
 *   a 23:30 session belongs to the day the user sat down and a 00:30 one does
 *   not, regardless of the UTC date or the server's clock.
 * - **Week.** A week bucket is the *date* its week starts on, derived from the
 *   day bucket by pure calendar arithmetic. That is what keeps a week from
 *   drifting across a DST weekend: `weekOf` counts dates, and dates do not
 *   change length.
 * - **Hour.** `minutesFromMidnight` is a wall-clock reading, not elapsed time.
 *   On a spring-forward day nothing lands in the hour the clock skipped, and on
 *   a fall-back day the repeated hour receives both passes. Both are what an
 *   axis labelled with clock hours should show.
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
  /** How many observations produced `value` — the sample size behind the bucket. */
  count: number;
}

/** The 24 hours of a local day, as an axis. */
export const HOURS_OF_DAY: readonly number[] = Array.from({ length: 24 }, (_, hour) => hour);

/** The local date an instant belongs to. */
export function dayBucket(at: Instant, timezone: IanaTimeZone): LocalDate {
  return localDateOf(at, timezone);
}

/**
 * The start date of the local week an instant belongs to, in the user's own
 * week shape (Monday or Sunday is a profile setting, never a constant).
 */
export function weekBucket(at: Instant, timezone: IanaTimeZone, weekStart: Weekday): LocalDate {
  return weekOf(localDateOf(at, timezone), weekStart).start;
}

/** The hour the local clock read, `0`–`23`. */
export function hourBucket(at: Instant, timezone: IanaTimeZone): number {
  return Math.floor(minutesFromMidnight(at, timezone) / 60);
}

/**
 * Sums `amountOf` into one bucket per key in `keys`, returned in `keys` order.
 *
 * Buckets are seeded at zero and kept even when empty: a chart's x-axis is the
 * period, not the days that happen to have data, and a week with three quiet
 * days should show three gaps rather than silently compress into four columns.
 *
 * An item whose key is not in `keys` is ignored rather than appended. That is
 * what makes it safe to hand this function ninety days of rows and a seven-day
 * axis, which is exactly what the page does.
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

/**
 * Minutes summed per weekday, with the number of observations behind each.
 *
 * The count is not decoration: an insight about a weekday is only allowed to
 * speak once enough observations sit behind it (Domain Rule 8), and this is
 * where that number comes from.
 */
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
  /**
   * Exactly seven entries, week-start first. `null` where the day falls outside
   * the period — the first and last weeks of a 30- or 90-day window are almost
   * always partial, and a heatmap must leave those cells absent rather than
   * draw them as days on which nothing happened.
   */
  days: (LocalDate | null)[];
}

/**
 * A period's days, grouped into the user's own weeks.
 *
 * The shape a consistency grid is drawn from: columns are weeks, rows are the
 * seven weekdays. It lives here rather than in the component because grouping
 * dates into weeks is date logic, and date logic does not belong in a component
 * (Domain Rule 5). It is also pure calendar arithmetic — `weekOf` and `addDays`
 * both count dates — so a DST weekend cannot shift a column.
 */
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
