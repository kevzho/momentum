import type { IanaTimeZone, Instant, LocalDate, LocalTime } from "../types/scalars";

/** Constructors and validators for the branded time scalars. */

const INSTANT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|z|[+-]\d{2}(?::?\d{2})?)$/;
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

/**
 * Normalises any ISO-8601 instant to `YYYY-MM-DDTHH:mm:ss.sssZ`. Postgres's
 * microseconds are truncated, not rounded; one canonical spelling lets two
 * instants be compared with `===`.
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

  // Already UTC: keep the digits rather than round-tripping through Date.
  if (offset === "Z" || offset === "z" || /^[+-]00(?::?00)?$/.test(offset)) {
    return `${year}-${month}-${day}T${hour}:${minute}:${second}.${millis}Z` as Instant;
  }

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

/** An IANA timezone identifier, validated against the runtime's timezone database. */
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

/** The fallback timezone. */
export const UTC = "UTC" as IanaTimeZone;
