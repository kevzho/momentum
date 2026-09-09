import type { IanaTimeZone, Instant, LocalDate, LocalTime } from "../types/scalars";

/**
 * Constructors and validators for the branded time scalars.
 *
 * This is the first slice of `@momentum/core/time`. Domain Rule 5 says every
 * piece of date logic lives in this module, and normalising a database
 * timestamp into an `Instant` is date logic, so it belongs here rather than in
 * a mapper. The timezone, boundary, snapping and formatting functions
 * described in docs/ARCHITECTURE.md §10 join it in Phase 3, when the calendar
 * needs them; nothing here depends on date-fns.
 */

const INSTANT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|z|[+-]\d{2}(?::?\d{2})?)$/;
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

/**
 * Normalises any ISO-8601 instant to `YYYY-MM-DDTHH:mm:ss.sssZ`.
 *
 * Postgres hands back microsecond precision (`…:00.123456+00:00`); the extra
 * digits are truncated, not rounded, so the value never moves forward in time.
 * Nothing in Momentum measures below a millisecond, and one canonical spelling
 * is what lets two instants be compared with `===`.
 */
export function instant(value: string): Instant {
  const match = INSTANT_PATTERN.exec(value.trim());
  if (!match) {
    throw new TypeError(`Not an ISO-8601 instant: ${JSON.stringify(value)}`);
  }

  const [, year, month, day, hour, minute, second, fraction, offset] = match as unknown as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string | undefined,
    string,
  ];

  const millis = (fraction ?? ".").slice(1).padEnd(3, "0").slice(0, 3);

  // Already UTC: keep the digits we were given rather than round-tripping
  // through Date, which would re-derive them from a float.
  if (offset === "Z" || offset === "z" || /^[+-]00(?::?00)?$/.test(offset)) {
    return `${year}-${month}-${day}T${hour}:${minute}:${second}.${millis}Z` as Instant;
  }

  // A non-UTC offset only reaches us from a client or a fixture. Date is the
  // simplest correct converter and never escapes this function.
  const parsed = new Date(
    `${year}-${month}-${day}T${hour}:${minute}:${second}.${millis}${normalizeOffset(offset)}`,
  );
  if (Number.isNaN(parsed.getTime())) {
    throw new TypeError(`Not an ISO-8601 instant: ${JSON.stringify(value)}`);
  }
  return parsed.toISOString() as Instant;
}

/** `+05`, `+0530` and `+05:30` all mean the same thing; Date only reads the last. */
function normalizeOffset(offset: string): string {
  if (offset.includes(":")) return offset;
  return offset.length === 3 ? `${offset}:00` : `${offset.slice(0, 3)}:${offset.slice(3)}`;
}

export function isInstant(value: string): boolean {
  return INSTANT_PATTERN.test(value.trim());
}

/** A calendar date `YYYY-MM-DD`. Rejects impossible dates such as `2026-02-30`. */
export function localDate(value: string): LocalDate {
  const trimmed = value.trim();
  if (!LOCAL_DATE_PATTERN.test(trimmed) || !isRealDate(trimmed)) {
    throw new TypeError(`Not a calendar date (YYYY-MM-DD): ${JSON.stringify(value)}`);
  }
  return trimmed as LocalDate;
}

export function isLocalDate(value: string): boolean {
  const trimmed = value.trim();
  return LOCAL_DATE_PATTERN.test(trimmed) && isRealDate(trimmed);
}

function isRealDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** A wall-clock time. Postgres `time` values arrive as `HH:MM:SS`; seconds are dropped. */
export function localTime(value: string): LocalTime {
  const trimmed = value.trim();
  if (!LOCAL_TIME_PATTERN.test(trimmed)) {
    throw new TypeError(`Not a wall-clock time (HH:MM): ${JSON.stringify(value)}`);
  }
  return trimmed.slice(0, 5) as LocalTime;
}

export function isLocalTime(value: string): boolean {
  return LOCAL_TIME_PATTERN.test(value.trim());
}

/**
 * An IANA timezone identifier. Validated against the runtime's own timezone
 * database, which is the same test the profile trigger applies in Postgres.
 */
export function ianaTimeZone(value: string): IanaTimeZone {
  const trimmed = value.trim();
  if (!isIanaTimeZone(trimmed)) {
    throw new TypeError(`Not an IANA timezone: ${JSON.stringify(value)}`);
  }
  return trimmed as IanaTimeZone;
}

export function isIanaTimeZone(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

/** The fallback every timezone decision falls back to, in one place. */
export const UTC = "UTC" as IanaTimeZone;
