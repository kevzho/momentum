import type { IanaTimeZone, Instant, LocalDate, Minutes } from "../types/scalars";
import { MINUTES_PER_DAY, utcMsOfLocalDate } from "./internal";
import { minutesFromMidnight } from "./zone";

/**
 * Every user-visible time string. Nothing here consults the host locale or
 * timezone: server and client must produce identical markup or React logs a
 * hydration mismatch.
 */

/** U+2013. */
const EN_DASH = "–";

interface TimeOptions {
  /** Default `false`: the grid and block labels are 24-hour ("09:00 – 10:30"). */
  hour12?: boolean;
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const cached = dateFormatters.get(key);
  if (cached) return cached;
  // A LocalDate is rendered from the UTC midnight that represents it; any other zone would shift dates.
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

/** `"Mon"` · `"Monday"` · `"7"` · `"Sep 7"` · `"Sep 7, 2026"` · `"Monday, September 7, 2026"`. */
export function formatLocalDate(d: LocalDate, style: LocalDateStyle): string {
  return dateFormatter(style, LOCAL_DATE_STYLES[style]).format(new Date(utcMsOfLocalDate(d)));
}

/**
 * Minutes since local midnight as `"05:00"` / `"5:00 AM"`. Wraps modulo a
 * day. Assembled by hand rather than via `Intl`, which would insert a narrow
 * no-break space before "AM" on recent ICU versions.
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

/** An instant as the clock in `tz` reads it. */
export function formatTime(i: Instant, tz: IanaTimeZone, options?: TimeOptions): string {
  return formatMinutesOfDay(minutesFromMidnight(i, tz), options);
}

/** `"09:00 – 10:30"`; in 12-hour mode `"9:00 – 10:30 AM"` when both ends share a meridiem, else `"11:00 AM – 1:30 PM"`. */
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

/** `"Sep 7 – Sep 13"`, `"Sep 28 – Oct 4"`, or `"Dec 29, 2025 – Jan 4, 2026"` when the week straddles a year. */
export function formatWeekRange(days: readonly LocalDate[]): string {
  const first = days.at(0);
  const last = days.at(-1);
  if (!first || !last) return "";
  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  const style: LocalDateStyle = sameYear ? "monthDay" : "medium";
  if (first === last) return formatLocalDate(first, style);
  return `${formatLocalDate(first, style)} ${EN_DASH} ${formatLocalDate(last, style)}`;
}

/** `"0m"` · `"45m"` · `"1h"` · `"1h 30m"` · `"2h 5m"` (never zero-padded). A negative value keeps its sign. */
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

/** `"25:00"` · `"04:59"` · `"1:30:00"`. The hour appears only when there is one; negative input clamps to `"00:00"`. */
export function formatCountdown(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(remainder).padStart(2, "0");
  return hours === 0 ? `${mm}:${ss}` : `${hours}:${mm}:${ss}`;
}
