import type { IanaTimeZone, Instant, LocalDate, Minutes, Weekday } from "../types/scalars";
import { addDays, weekOf } from "./calendar-date";
import {
  epochOf,
  instantFromEpoch,
  localDateFields,
  localDateFromUtcMs,
  MS_PER_DAY,
  MINUTES_PER_DAY,
  MS_PER_MINUTE,
  MS_PER_SECOND,
  utcMs,
} from "./internal";

/**
 * Everything that needs a timezone to answer. The timezone is always a
 * parameter; nothing reads an ambient default. Offsets come from
 * `Intl.DateTimeFormat` directly so the DST gap and overlap rules below are
 * explicit rather than a library's disambiguation defaults.
 */

// `Intl.DateTimeFormat` construction is expensive; the grid asks once per block per render.
const fieldsFormatters = new Map<string, Intl.DateTimeFormat>();

function fieldsFormatter(tz: IanaTimeZone): Intl.DateTimeFormat {
  const cached = fieldsFormatters.get(tz);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    // h23 rather than `hour12: false`: some ICU versions render midnight as hour "24" under the latter.
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  fieldsFormatters.set(tz, created);
  return created;
}

interface ZonedFields {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** The wall-clock fields an observer in `tz` reads off the clock at `ms`. */
function zonedFields(ms: number, tz: IanaTimeZone): ZonedFields {
  const fields: ZonedFields = { year: 0, month: 1, day: 1, hour: 0, minute: 0, second: 0 };
  for (const part of fieldsFormatter(tz).formatToParts(new Date(ms))) {
    switch (part.type) {
      case "year":
        fields.year = Number(part.value);
        break;
      case "month":
        fields.month = Number(part.value);
        break;
      case "day":
        fields.day = Number(part.value);
        break;
      case "hour":
        // Against an ICU build that still says "24".
        fields.hour = Number(part.value) % 24;
        break;
      case "minute":
        fields.minute = Number(part.value);
        break;
      case "second":
        fields.second = Number(part.value);
        break;
      default:
        break;
    }
  }
  return fields;
}

/**
 * The zone's UTC offset at an instant, in milliseconds (positive east).
 * Milliseconds because some zones carried offsets with seconds before
 * standard time, and rounding would break `fromLocal`'s round trip there.
 */
function offsetMsAt(ms: number, tz: IanaTimeZone): number {
  const f = zonedFields(ms, tz);
  const wall = utcMs(f.year, f.month, f.day, f.hour, f.minute, f.second);
  // The formatter has no sub-second resolution, so compare against the second-truncated instant.
  return wall - Math.floor(ms / MS_PER_SECOND) * MS_PER_SECOND;
}

/** The local calendar date a UTC instant falls on. */
export function localDateOf(i: Instant, tz: IanaTimeZone): LocalDate {
  const f = zonedFields(epochOf(i), tz);
  return localDateFromUtcMs(utcMs(f.year, f.month, f.day));
}

/**
 * Wall-clock minutes since the local day's 00:00, not elapsed time. On a
 * fall-back day two instants an hour apart map to the same value.
 */
export function minutesFromMidnight(i: Instant, tz: IanaTimeZone): Minutes {
  const f = zonedFields(epochOf(i), tz);
  return f.hour * 60 + f.minute;
}

/**
 * Wall clock in `tz` → UTC instant. `minutes` may be outside [0, 1440); the
 * overflow lands on adjacent dates. DST gap (02:00 → 03:00): the reading
 * moves forward by the gap, so 02:30 resolves to 03:30 local. DST overlap:
 * the first occurrence, on the pre-transition offset, which keeps the
 * function monotonic in `minutes`.
 */
export function fromLocal(date: LocalDate, minutes: Minutes, tz: IanaTimeZone): Instant {
  const { year, month, day } = localDateFields(date);
  // A "wall millisecond": the local clock reading encoded as though it were UTC. Not an instant.
  const wall = utcMs(year, month, day) + Math.round(minutes) * MS_PER_MINUTE;

  // A day either side brackets any transition; no zone has moved its clock twice within 48 hours.
  const offsetBefore = offsetMsAt(wall - MS_PER_DAY, tz);
  const offsetAfter = offsetMsAt(wall + MS_PER_DAY, tz);

  // Pre-transition offset first, so an overlap resolves to its first occurrence.
  const earlier = wall - offsetBefore;
  if (offsetMsAt(earlier, tz) === offsetBefore) return instantFromEpoch(earlier);

  const later = wall - offsetAfter;
  if (offsetMsAt(later, tz) === offsetAfter) return instantFromEpoch(later);

  // Inside a gap: the pre-transition offset lands exactly one gap-width later on the clock.
  return instantFromEpoch(earlier);
}

/** Internal sibling of `startOfDay` that stays in milliseconds, for the loops below. */
function startOfDayMs(date: LocalDate, tz: IanaTimeZone): number {
  return epochOf(fromLocal(date, 0, tz));
}

/** The first instant of a local day; 01:00 local where a zone skips its own midnight (Chile). */
export function startOfDay(date: LocalDate, tz: IanaTimeZone): Instant {
  return fromLocal(date, 0, tz);
}

/** The exclusive end of a local day: the next day's `startOfDay`. Windows are half-open `[start, end)`. */
export function endOfDay(date: LocalDate, tz: IanaTimeZone): Instant {
  return startOfDay(addDays(date, 1), tz);
}

/** "Today" resolved in the user's timezone. */
export function todayIn(tz: IanaTimeZone, now: Instant): LocalDate {
  return localDateOf(now, tz);
}

/** Two instants share a day column when they share a local date. */
export function isSameLocalDay(a: Instant, b: Instant, tz: IanaTimeZone): boolean {
  return localDateOf(a, tz) === localDateOf(b, tz);
}

/** When the user's calendar rolls over: the real boundary, 23 or 25 hours out on a transition day. */
export function nextLocalMidnight(tz: IanaTimeZone, now: Instant): Instant {
  return startOfDay(addDays(localDateOf(now, tz), 1), tz);
}

/**
 * Elapsed minutes between this local midnight and the next: 1440, 1380 on a
 * spring-forward day, 1500 on a fall-back day. Not a wall-clock coordinate;
 * `splitByLocalDay` deliberately does not use it.
 */
export function localDayLengthMinutes(date: LocalDate, tz: IanaTimeZone): Minutes {
  const start = startOfDayMs(date, tz);
  const next = startOfDayMs(addDays(date, 1), tz);
  return Math.round((next - start) / MS_PER_MINUTE);
}

/** One local day's share of a span, in the grid's wall-clock coordinates. */
export interface LocalDaySegment {
  date: LocalDate;
  startMinutes: Minutes;
  endMinutes: Minutes;
}

/**
 * Cuts a span at local midnights. Every coordinate is wall clock: a segment
 * running to midnight ends at 1440, never at `localDayLengthMinutes`, which
 * would be wrong in both directions on a DST day. Half-open; an empty or
 * inverted span produces nothing.
 */
export function splitByLocalDay(start: Instant, end: Instant, tz: IanaTimeZone): LocalDaySegment[] {
  const startMs = epochOf(start);
  const endMs = epochOf(end);
  if (endMs <= startMs) return [];

  const segments: LocalDaySegment[] = [];
  let cursor = startMs;
  let date = localDateOf(start, tz);

  while (cursor < endMs) {
    const dayEnd = startOfDayMs(addDays(date, 1), tz);
    const segmentEnd = Math.min(dayEnd, endMs);
    segments.push({
      date,
      startMinutes: minutesFromMidnight(instantFromEpoch(cursor), tz),
      endMinutes:
        segmentEnd >= dayEnd
          ? MINUTES_PER_DAY
          : minutesFromMidnight(instantFromEpoch(segmentEnd), tz),
    });
    cursor = dayEnd;
    date = addDays(date, 1);
  }

  return segments;
}

/** The half-open UTC window `[start, end)` covering a displayed week: 167 or 169 hours wide on a DST week. */
export function weekRange(
  date: LocalDate,
  weekStart: Weekday,
  tz: IanaTimeZone,
): { start: Instant; end: Instant } {
  const { start } = weekOf(date, weekStart);
  return { start: startOfDay(start, tz), end: startOfDay(addDays(start, 7), tz) };
}
