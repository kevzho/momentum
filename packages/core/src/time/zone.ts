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
 * Everything that needs a timezone to answer.
 *
 * The timezone is always a parameter. No function here reads
 * `Intl.DateTimeFormat().resolvedOptions().timeZone`, `Date#getHours`, or any
 * other ambient default — the persisted answer must come from the user's
 * profile, never from the server's clock or the browser's guess (Domain
 * Rule 4). The suite runs twice under different `TZ` values to prove it.
 *
 * Offsets are looked up through `Intl.DateTimeFormat`, not `@date-fns/tz`.
 * The lookup below is the whole timezone dependency — a handful of lines
 * against the runtime's own tz database, which is the same source date-fns
 * would consult — and going direct means the DST gap and overlap rules are
 * written out explicitly here rather than inherited from a library's
 * disambiguation defaults, which do not match the ones this product needs.
 */

/**
 * `Intl.DateTimeFormat` construction is expensive relative to formatting, and
 * the grid asks for the offset once per block per render. There are at most a
 * couple of distinct zones alive in a process (the profile's, and UTC), so an
 * unbounded map is bounded in practice.
 */
const fieldsFormatters = new Map<string, Intl.DateTimeFormat>();

function fieldsFormatter(tz: IanaTimeZone): Intl.DateTimeFormat {
  const cached = fieldsFormatters.get(tz);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    // h23 rather than `hour12: false`: some ICU versions render midnight as
    // hour "24" under the latter, which would put every local midnight on the
    // previous date.
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
        // Belt and braces against an ICU build that still says "24".
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
 * The zone's UTC offset at a given instant, in milliseconds (positive east).
 *
 * Milliseconds rather than minutes because a handful of zones carried
 * offsets with seconds in them before standard time (Europe/London until
 * 1847, Asia/Kolkata until 1906). Rounding those to whole minutes here would
 * make `fromLocal`'s round trip fail on a historical date for no benefit.
 */
function offsetMsAt(ms: number, tz: IanaTimeZone): number {
  const f = zonedFields(ms, tz);
  const wall = utcMs(f.year, f.month, f.day, f.hour, f.minute, f.second);
  // The formatter has no sub-second resolution, so compare against the
  // second-truncated instant or every offset would be off by the milliseconds.
  return wall - Math.floor(ms / MS_PER_SECOND) * MS_PER_SECOND;
}

/** The local calendar date a UTC instant falls on — Domain Rule 4's "which day column". */
export function localDateOf(i: Instant, tz: IanaTimeZone): LocalDate {
  const f = zonedFields(epochOf(i), tz);
  return localDateFromUtcMs(utcMs(f.year, f.month, f.day));
}

/**
 * Wall-clock minutes since the local day's 00:00 — the grid's vertical
 * coordinate (docs/ARCHITECTURE.md §9), not elapsed time.
 *
 * On a spring-forward day nothing maps into 02:00–03:00 because the clock
 * never reads it; on a fall-back day two instants an hour apart map to the
 * same value because the clock reads it twice. Both are correct for a grid
 * whose rows are labelled with wall-clock hours.
 */
export function minutesFromMidnight(i: Instant, tz: IanaTimeZone): Minutes {
  const f = zonedFields(epochOf(i), tz);
  return f.hour * 60 + f.minute;
}

/**
 * Wall clock in `tz` → UTC instant. The single most important function here:
 * every drop, resize, and create in the calendar ends in a call to it.
 *
 * `minutes` may be out of [0, 1440) — geometry code hands us a negative value
 * when a block is dragged above the top of the grid, and a value past 1440
 * when it is dragged below. `Date.UTC` normalises the overflow into adjacent
 * dates, so no clamping or throwing is needed.
 *
 * Two wall-clock times are not a single instant, and the choice is made here:
 *
 * - **DST gap** (spring forward, local 02:00 → 03:00): the requested time does
 *   not exist. We move forward by the size of the gap, so 02:30 resolves to
 *   the instant that reads 03:30 locally. A user who asked for "half past two"
 *   gets a block that starts as soon as half past two would have, rather than
 *   an error dialog on two days a year.
 * - **DST overlap** (fall back, local 01:00–02:00 happens twice): we take the
 *   first occurrence, still on the pre-transition offset. It is the earlier of
 *   the two instants, which keeps `fromLocal` monotonic with respect to
 *   `minutes` and keeps blocks in the order the user placed them.
 */
export function fromLocal(date: LocalDate, minutes: Minutes, tz: IanaTimeZone): Instant {
  const { year, month, day } = localDateFields(date);
  // A "wall millisecond": the local clock reading encoded as though it were
  // UTC. It is not an instant, and never leaves this function.
  const wall = utcMs(year, month, day) + Math.round(minutes) * MS_PER_MINUTE;

  // Sampling a day either side brackets any transition that could affect this
  // reading; no zone has ever moved its clock twice within 48 hours.
  const offsetBefore = offsetMsAt(wall - MS_PER_DAY, tz);
  const offsetAfter = offsetMsAt(wall + MS_PER_DAY, tz);

  // Checking the pre-transition offset first is what makes the overlap resolve
  // to its first occurrence: in a fall-back both candidates are valid, and this
  // one is the earlier instant.
  const earlier = wall - offsetBefore;
  if (offsetMsAt(earlier, tz) === offsetBefore) return instantFromEpoch(earlier);

  const later = wall - offsetAfter;
  if (offsetMsAt(later, tz) === offsetAfter) return instantFromEpoch(later);

  // Neither candidate survives: the reading is inside a gap. Applying the
  // pre-transition offset anyway lands exactly one gap-width later on the
  // clock, which is the "move forward" rule above.
  return instantFromEpoch(earlier);
}

/** Internal sibling of `startOfDay` that stays in milliseconds, for the loops below. */
function startOfDayMs(date: LocalDate, tz: IanaTimeZone): number {
  return epochOf(fromLocal(date, 0, tz));
}

/**
 * The first instant of a local day.
 *
 * On the two days a year a zone skips its own midnight — Chile does, moving
 * the clock at 24:00 — this is the instant the local date changes, i.e. 01:00
 * local. That is the correct lower bound for the day's query window; there is
 * no earlier instant that belongs to the date.
 */
export function startOfDay(date: LocalDate, tz: IanaTimeZone): Instant {
  return fromLocal(date, 0, tz);
}

/**
 * The **exclusive** end of a local day: the next day's `startOfDay`
 * (docs/ARCHITECTURE.md §10). Windows in this codebase are half-open
 * `[start, end)`, so an event ending exactly at midnight belongs to the
 * earlier day and is not double-counted by the next day's query.
 */
export function endOfDay(date: LocalDate, tz: IanaTimeZone): Instant {
  return startOfDay(addDays(date, 1), tz);
}

/** "Today" resolved in the user's timezone, never the server's (Domain Rule 4). */
export function todayIn(tz: IanaTimeZone, now: Instant): LocalDate {
  return localDateOf(now, tz);
}

/** Two instants share a day column when they share a local date — 23:30 and 00:30 do not. */
export function isSameLocalDay(a: Instant, b: Instant, tz: IanaTimeZone): boolean {
  return localDateOf(a, tz) === localDateOf(b, tz);
}

/**
 * When the user's calendar rolls over. `useMidnightRollover` schedules a
 * refresh at this instant, so it has to be the real boundary on a transition
 * day — 23 or 25 hours out, not a hardcoded 24.
 */
export function nextLocalMidnight(tz: IanaTimeZone, now: Instant): Instant {
  return startOfDay(addDays(localDateOf(now, tz), 1), tz);
}

/**
 * Minutes between this local midnight and the next: 1440 normally, 1380 on a
 * spring-forward day, 1500 on a fall-back day.
 *
 * This is ELAPSED time, not a wall-clock coordinate, and the two must not be
 * confused: on a spring-forward day the clock still reads 00:00 to 24:00 even
 * though only 1380 minutes pass. Capacity and Find Time maths (Phase 5) want
 * this number; the grid does not, and `splitByLocalDay` deliberately does not
 * use it.
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
 * Cuts a span at local midnights so the renderer can place it.
 *
 * A block from 23:30 Monday to 00:30 Tuesday is partly Monday's and partly
 * Tuesday's; Domain Rule 4's "a block at 23:30 local belongs to today's
 * column" is only true in the UI because this function makes it so.
 *
 * Every coordinate here is WALL CLOCK, which is the space the grid is laid out
 * in: a segment running to midnight ends at 1440 — the bottom of the column —
 * not at 0 of the next day and not at `localDayLengthMinutes`. Using the
 * elapsed day length would be wrong in both directions on a DST day: a 23:30
 * block on a spring-forward date would end at 1380, i.e. *before* it starts,
 * and on a fall-back date a 60-minute block would draw 90 minutes tall.
 * Elapsed and wall-clock are different quantities and only one of them places
 * a block on a grid.
 *
 * Half-open, like every window here: a span ending exactly at midnight
 * produces no empty segment for the following day. An empty or inverted span
 * produces nothing at all, so callers never have to special-case a zero-height
 * block.
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

/**
 * The half-open UTC window `[start, end)` covering a displayed week — the
 * exact bounds the calendar's window query uses.
 *
 * Timezone-sensitive where `weekOf` is not: the week is seven *local* days, so
 * on a DST week the window is 167 or 169 hours wide, not 168.
 */
export function weekRange(
  date: LocalDate,
  weekStart: Weekday,
  tz: IanaTimeZone,
): { start: Instant; end: Instant } {
  const { start } = weekOf(date, weekStart);
  return { start: startOfDay(start, tz), end: startOfDay(addDays(start, 7), tz) };
}
