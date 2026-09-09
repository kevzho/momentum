import { localTime } from "./scalars";
import type { LocalTime, Minutes } from "../types/scalars";

/**
 * `LocalTime` ↔ minutes-from-midnight.
 *
 * The grid, the drag geometry and every action input work in minutes from
 * midnight; `<input type="time">` and the `time` columns work in `HH:MM`. The
 * two conversions are the boundary between them, and they belong here for the
 * same reason `formatMinutesOfDay` does — a form that parses `"09:30"` with its
 * own `split(":")` is ad-hoc date logic in a component (Domain Rule 5), and two
 * forms doing it are two chances to disagree.
 *
 * Neither function needs a timezone: a wall-clock time is already resolved
 * against one. That is precisely why they are not in `zone.ts`.
 */

const MINUTES_PER_DAY = 1_440;

/**
 * Parses a `HH:MM` value into minutes from midnight, or null if it is not one.
 *
 * Null rather than a throw because the only caller is a form field, and a
 * half-typed value is a normal state of an input, not an exception. `<input
 * type="time">` also reports an empty string when the user clears it, and that
 * is the same answer: nothing yet.
 */
export function minutesOfLocalTimeValue(value: string): Minutes | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(trimmed);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** The same parse for a value already known to be a `LocalTime`. */
export function minutesOfLocalTime(value: LocalTime): Minutes {
  const minutes = minutesOfLocalTimeValue(value);
  if (minutes === null) {
    throw new TypeError(`Not a wall-clock time (HH:MM): ${JSON.stringify(value)}`);
  }
  return minutes;
}

/**
 * The inverse: minutes from midnight as `HH:MM`.
 *
 * Wraps modulo a day, so the 1440 that marks the bottom of the grid renders as
 * `00:00` rather than as a 25th hour, and so a span that crossed midnight —
 * whose end is legitimately past 1440 — still produces a value an input will
 * accept (Domain Rule 4 keeps the *date* separate; this is only the clock).
 */
export function localTimeOfMinutes(minutes: Minutes): LocalTime {
  const wrapped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(wrapped / 60);
  const rest = wrapped % 60;
  return localTime(`${pad(hours)}:${pad(rest)}`);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
