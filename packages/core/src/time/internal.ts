import type { Instant, LocalDate } from "../types/scalars";
import { instant, localDate } from "./scalars";

/** Internal to `@momentum/core/time`; deliberately not re-exported, so raw milliseconds never leave the module. */

export const MS_PER_SECOND = 1_000;
export const MS_PER_MINUTE = 60_000;
export const MS_PER_DAY = 86_400_000;
export const MINUTES_PER_DAY = 1_440;

/** `Date.parse` is safe here: an `Instant` is canonical UTC, so the host timezone cannot leak in. */
export function epochOf(i: Instant): number {
  const ms = Date.parse(i);
  if (Number.isNaN(ms)) {
    throw new TypeError(`Not a parseable instant: ${JSON.stringify(i)}`);
  }
  return ms;
}

/** Throws on a non-finite or out-of-range millisecond value rather than producing "Invalid Date" downstream. */
export function instantFromEpoch(ms: number): Instant {
  if (!Number.isFinite(ms)) {
    throw new TypeError(`Not a finite epoch millisecond value: ${String(ms)}`);
  }
  return instant(new Date(ms).toISOString());
}

/** `Date.UTC` maps two-digit years onto 1900–1999; `LocalDate` permits years from `0000`, so that is corrected. */
export function utcMs(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): number {
  const ms = Date.UTC(year, month - 1, day, hour, minute, second);
  if (year >= 0 && year < 100) {
    const corrected = new Date(ms);
    corrected.setUTCFullYear(year);
    return corrected.getTime();
  }
  return ms;
}

/** Splits `YYYY-MM-DD` into its numbers. The brand guarantees the shape, so no re-validation. */
export function localDateFields(date: LocalDate): { year: number; month: number; day: number } {
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  };
}

/** The UTC midnight of a `LocalDate`: a coordinate for arithmetic, not the instant the local day starts (`startOfDay`). */
export function utcMsOfLocalDate(date: LocalDate): number {
  const { year, month, day } = localDateFields(date);
  return utcMs(year, month, day);
}

export function localDateFromFields(year: number, month: number, day: number): LocalDate {
  const y = String(year).padStart(4, "0");
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return localDate(`${y}-${m}-${d}`);
}

/** Reads the calendar fields of a millisecond value **as UTC**; never the host's local fields. */
export function localDateFromUtcMs(ms: number): LocalDate {
  const d = new Date(ms);
  return localDateFromFields(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}
