import type { Instant, LocalDate } from "../types/scalars";
import { instant, localDate } from "./scalars";

/**
 * The numeric representations the branded scalars are built on, and the
 * conversions between them.
 *
 * Internal to `@momentum/core/time`: `index.ts` deliberately does not
 * re-export this file. Every public function in the module takes and returns
 * branded scalars, and the moment a caller outside is handed a raw
 * millisecond number it becomes possible to do date maths in a component —
 * which is exactly what Domain Rule 5 exists to prevent.
 */

export const MS_PER_SECOND = 1_000;
export const MS_PER_MINUTE = 60_000;
export const MS_PER_DAY = 86_400_000;
export const MINUTES_PER_DAY = 1_440;

/**
 * `Date.parse` is safe here in a way it is not in application code: an
 * `Instant` is already canonical UTC (`…Z`), so the parse cannot pick up the
 * host timezone. That guarantee is the whole reason the brand exists.
 */
export function epochOf(i: Instant): number {
  const ms = Date.parse(i);
  if (Number.isNaN(ms)) {
    throw new TypeError(`Not a parseable instant: ${JSON.stringify(i)}`);
  }
  return ms;
}

/**
 * `toISOString()` already emits the canonical `YYYY-MM-DDTHH:mm:ss.sssZ`
 * spelling, so `instant()` here is validating rather than converting. It is
 * kept because it is the module's single door onto the brand, and because a
 * NaN or out-of-range millisecond becomes a typed error at the point of
 * construction instead of an "Invalid Date" surfacing somewhere downstream.
 */
export function instantFromEpoch(ms: number): Instant {
  if (!Number.isFinite(ms)) {
    throw new TypeError(`Not a finite epoch millisecond value: ${String(ms)}`);
  }
  return instant(new Date(ms).toISOString());
}

/**
 * `Date.UTC` maps two-digit years onto 1900–1999, so a year like `0099` would
 * silently become 1999. `LocalDate` permits four-digit years from `0000`, so
 * the legacy behaviour is corrected rather than assumed away.
 */
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

/**
 * The UTC midnight that represents a `LocalDate` as a point on the number
 * line. It is a coordinate for arithmetic, not an instant: the real instant a
 * local day starts at is `startOfDay(date, tz)`, which is a different number
 * in every zone.
 */
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
