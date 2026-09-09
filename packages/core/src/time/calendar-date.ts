import type { LocalDate, Weekday } from "../types/scalars";
import { localDateFromUtcMs, MS_PER_DAY, utcMsOfLocalDate } from "./internal";

/**
 * Pure calendar-date arithmetic. No timezone parameter: a `LocalDate` has
 * already resolved its zone. Works in UTC milliseconds, never `Date`'s local
 * accessors, so the answer is the same under any process timezone.
 */

/** `n` may be negative. */
export function addDays(date: LocalDate, n: number): LocalDate {
  return localDateFromUtcMs(utcMsOfLocalDate(date) + Math.round(n) * MS_PER_DAY);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. `diffDays(d, d)` is 0. */
export function diffDays(from: LocalDate, to: LocalDate): number {
  return Math.round((utcMsOfLocalDate(to) - utcMsOfLocalDate(from)) / MS_PER_DAY);
}

/** `0` = Sunday … `6` = Saturday. */
export function weekdayOf(date: LocalDate): Weekday {
  // getUTCDay()'s range is exactly Weekday's domain.
  return new Date(utcMsOfLocalDate(date)).getUTCDay() as Weekday;
}

/** The seven days of the week containing `date`, starting on `weekStart` (any weekday). */
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
