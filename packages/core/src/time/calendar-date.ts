import type { LocalDate, Weekday } from "../types/scalars";
import { localDateFromUtcMs, MS_PER_DAY, utcMsOfLocalDate } from "./internal";

/**
 * Pure calendar-date arithmetic.
 *
 * Nothing here takes an `IanaTimeZone`, and that is the point: a `LocalDate`
 * has already resolved its timezone. "The day after 2026-03-08" is the same
 * answer in every zone, whereas "the instant 24 hours after this local
 * midnight" is not (docs/ARCHITECTURE.md §10). Keeping the two apart is what
 * stops week navigation from drifting on a DST weekend — stepping the grid
 * forward a week is date arithmetic, and only the final conversion to a query
 * window (`weekRange`) is timezone-sensitive.
 *
 * The implementation works in UTC milliseconds rather than through `Date`'s
 * local accessors. A `new Date(2026, 2, 8)` is midnight in whatever timezone
 * the process happens to run in and would give different answers under the
 * `core` and `core:tz` Vitest projects.
 */

/**
 * `n` may be negative. Month, year and leap-day boundaries fall out of UTC
 * millisecond arithmetic for free: every UTC day is exactly 86_400_000 ms, and
 * how long the *local* day turns out to be (23h, 25h) has no bearing on which
 * date follows which.
 */
export function addDays(date: LocalDate, n: number): LocalDate {
  return localDateFromUtcMs(utcMsOfLocalDate(date) + Math.round(n) * MS_PER_DAY);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. `diffDays(d, d)` is 0. */
export function diffDays(from: LocalDate, to: LocalDate): number {
  return Math.round((utcMsOfLocalDate(to) - utcMsOfLocalDate(from)) / MS_PER_DAY);
}

/**
 * `0` = Sunday … `6` = Saturday: the date-fns `weekStartsOn` convention that
 * the `Weekday` type is defined in.
 */
export function weekdayOf(date: LocalDate): Weekday {
  // getUTCDay()'s range is exactly Weekday's domain, so this narrows a value
  // the runtime already guarantees rather than asserting something unchecked.
  return new Date(utcMsOfLocalDate(date)).getUTCDay() as Weekday;
}

/**
 * The seven days of the week containing `date`, starting on `weekStart`.
 *
 * `weekStart` is a user preference with a Monday default (Domain Rule 4), so
 * Sunday and Monday weeks — and, since the type permits it, any other start —
 * all have to be right.
 */
export function weekOf(
  date: LocalDate,
  weekStart: Weekday,
): { start: LocalDate; days: LocalDate[] } {
  const offset = (weekdayOf(date) - weekStart + 7) % 7;
  const start = addDays(date, -offset);
  const startMs = utcMsOfLocalDate(start);
  const days: LocalDate[] = [];
  for (let i = 0; i < 7; i += 1) {
    days.push(localDateFromUtcMs(startMs + i * MS_PER_DAY));
  }
  return { start, days };
}
