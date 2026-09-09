import { localTime } from "./scalars";
import type { LocalTime, Minutes } from "../types/scalars";

/** `LocalTime` <-> minutes-from-midnight. No timezone: a wall-clock time is already resolved against one. */

const MINUTES_PER_DAY = 1_440;

/** Parses a `HH:MM` (optionally `HH:MM:SS`) value into minutes from midnight; null for empty or half-typed input. */
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

/** Minutes from midnight as `HH:MM`. Wraps modulo a day, so 1440 (the grid's bottom edge) renders as `00:00`. */
export function localTimeOfMinutes(minutes: Minutes): LocalTime {
  const wrapped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(wrapped / 60);
  const rest = wrapped % 60;
  return localTime(`${pad(hours)}:${pad(rest)}`);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
