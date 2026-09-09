import type { IanaTimeZone, Instant, LocalDate, Minutes } from "../types/scalars";
import { MINUTES_PER_DAY, utcMsOfLocalDate } from "./internal";
import { minutesFromMidnight } from "./zone";

/**
 * Every user-visible time string in the product.
 *
 * Two constraints shape all of it. First, the same markup has to come out of
 * the server and the client or React logs a hydration mismatch, so nothing
 * here consults the host locale or the host timezone: dates are formatted with
 * an explicit `"en-US"` locale and an explicit `timeZone`, and clock readings
 * are assembled arithmetically. Second, the strings have to match the ones the
 * design mockups were built against (the Phase 1 placeholder data, since
 * removed), which is where the 24-hour default and the spaced en dash come from.
 */

/** U+2013. A hyphen is not a range separator, and an em dash is too wide between numerals. */
const EN_DASH = "–";

interface TimeOptions {
  /** Default `false`: the grid and block labels are 24-hour ("09:00 – 10:30"). */
  hour12?: boolean;
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const cached = dateFormatters.get(key);
  if (cached) return cached;
  // `timeZone: "UTC"` is not a display choice: a LocalDate is rendered from the
  // UTC midnight that represents it, so any other zone would shift half of them
  // to the previous day.
  const created = new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" });
  dateFormatters.set(key, created);
  return created;
}

const LOCAL_DATE_STYLES = {
  weekday: { weekday: "short" },
  weekdayLong: { weekday: "long" },
  dayOfMonth: { day: "numeric" },
  monthDay: { month: "short", day: "numeric" },
  medium: { month: "short", day: "numeric", year: "numeric" },
  long: { weekday: "long", month: "long", day: "numeric", year: "numeric" },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

export type LocalDateStyle = keyof typeof LOCAL_DATE_STYLES;

/**
 * `"Mon"` · `"Monday"` · `"7"` · `"Sep 7"` · `"Sep 7, 2026"` ·
 * `"Monday, September 7, 2026"`.
 *
 * The column headers use `weekday` + `dayOfMonth` separately so they can be
 * styled independently; the rest are for headings and tooltips.
 */
export function formatLocalDate(d: LocalDate, style: LocalDateStyle): string {
  return dateFormatter(style, LOCAL_DATE_STYLES[style]).format(new Date(utcMsOfLocalDate(d)));
}

/**
 * A wall-clock reading, from minutes since local midnight: `"05:00"` /
 * `"5:00 AM"`. Used directly for the grid's hour gutter, where there is no
 * instant to format — only a row coordinate.
 *
 * Values outside a day wrap, so the grid's 1440 bottom edge renders as
 * midnight rather than as a 25th hour. Assembling the string by hand instead
 * of via `Intl` also avoids the narrow no-break space that recent ICU versions
 * put before "AM", which would leak an invisible character into snapshots and
 * into anything that compares these labels.
 */
export function formatMinutesOfDay(minutes: Minutes, options?: TimeOptions): string {
  const wrapped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  const paddedMinute = String(minute).padStart(2, "0");
  if (!options?.hour12) {
    return `${String(hour).padStart(2, "0")}:${paddedMinute}`;
  }
  return `${hour % 12 === 0 ? 12 : hour % 12}:${paddedMinute} ${hour < 12 ? "AM" : "PM"}`;
}

/**
 * An instant as the clock in `tz` reads it. Deterministic on both sides of the
 * server/client boundary because `tz` is the profile's timezone, passed in.
 */
export function formatTime(i: Instant, tz: IanaTimeZone, options?: TimeOptions): string {
  return formatMinutesOfDay(minutesFromMidnight(i, tz), options);
}

/**
 * `"09:00 – 10:30"`, or in 12-hour mode `"9:00 – 10:30 AM"` when both ends
 * share a meridiem and `"11:00 AM – 1:30 PM"` when they do not. Collapsing the
 * repeated AM/PM is what keeps a block label readable at 15-minute heights.
 */
export function formatTimeRange(
  a: Instant,
  b: Instant,
  tz: IanaTimeZone,
  options?: TimeOptions,
): string {
  const from = formatTime(a, tz, options);
  const to = formatTime(b, tz, options);
  if (options?.hour12) {
    const fromMeridiem = from.slice(-2);
    if (fromMeridiem === to.slice(-2)) {
      return `${from.slice(0, -3)} ${EN_DASH} ${to}`;
    }
  }
  return `${from} ${EN_DASH} ${to}`;
}

/**
 * The header label for a displayed week: `"Sep 7 – Sep 13"` inside one month,
 * `"Sep 28 – Oct 4"` across one, `"Dec 29, 2025 – Jan 4, 2026"` across a year.
 *
 * The year appears only when the week straddles one, because a year on every
 * label is noise on 51 weeks out of 52 and the one week it matters is the one
 * where navigation is easiest to get lost in.
 */
export function formatWeekRange(days: readonly LocalDate[]): string {
  const first = days.at(0);
  const last = days.at(-1);
  if (!first || !last) return "";
  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  const style: LocalDateStyle = sameYear ? "monthDay" : "medium";
  if (first === last) return formatLocalDate(first, style);
  return `${formatLocalDate(first, style)} ${EN_DASH} ${formatLocalDate(last, style)}`;
}

/**
 * `"0m"` · `"45m"` · `"1h"` · `"1h 30m"` · `"2h 5m"` · `"18h 45m"`.
 *
 * One convention, used everywhere: hours first, minutes omitted when zero,
 * minutes **not** zero-padded ("2h 5m", never "2h 05m"), a space between the
 * parts. It matches the strings the design mockups were built with. A negative
 * value keeps its sign rather than being clamped, so a scheduling shortfall
 * can be shown without a second formatter.
 */
export function formatDuration(minutes: Minutes): string {
  const total = Math.round(minutes);
  const sign = total < 0 ? "-" : "";
  const absolute = Math.abs(total);
  const hours = Math.floor(absolute / 60);
  const remainder = absolute % 60;
  if (hours === 0) return `${sign}${remainder}m`;
  if (remainder === 0) return `${sign}${hours}h`;
  return `${sign}${hours}h ${remainder}m`;
}

/**
 * `"25:00"` · `"04:59"` · `"1:30:00"` — a clock, for a clock.
 *
 * The one place in the product that shows seconds. `formatDuration`'s "1h 30m"
 * is right for an estimate and wrong for a running timer: a countdown is read
 * at a glance, dozens of times, and the eye wants fixed columns. Minutes and
 * seconds are always two digits; the hour appears only when there is one, so
 * the common case stays four characters wide and does not reflow at 59:59.
 *
 * Negative input is clamped to zero. A countdown that has run out reads
 * `"00:00"`, and how far past the bell a session has gone is a separate number
 * with its own wording, not a minus sign here.
 */
export function formatCountdown(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(remainder).padStart(2, "0");
  return hours === 0 ? `${mm}:${ss}` : `${hours}:${mm}:${ss}`;
}
