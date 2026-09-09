import type { Instant, Minutes } from "../types/scalars";
import { epochOf, instantFromEpoch, MS_PER_MINUTE, MS_PER_SECOND } from "./internal";

/**
 * Elapsed-time arithmetic; no timezone needed. Elapsed and wall-clock time
 * differ across DST: a 01:00–02:00 block on a spring-forward morning is 0
 * minutes here, and 120 on the fall-back morning.
 */

/** Negative when `end` precedes `start`. Rounded because `Minutes` is a whole number. */
export function durationMinutes(start: Instant, end: Instant): Minutes {
  return Math.round((epochOf(end) - epochOf(start)) / MS_PER_MINUTE);
}

/**
 * Whole seconds, truncated toward zero so a second is only counted once fully
 * elapsed (the focus timer reads this once a second). Negative when `end`
 * precedes `start`; callers clamp.
 */
export function durationSeconds(start: Instant, end: Instant): number {
  return Math.trunc((epochOf(end) - epochOf(start)) / MS_PER_SECOND);
}

/**
 * Shifts an instant by elapsed minutes; may be negative. Not the way to move a
 * block to "the same time tomorrow" (DST): use `fromLocal(addDays(date, 1), minutes, tz)`.
 */
export function addMinutes(i: Instant, minutes: Minutes): Instant {
  return instantFromEpoch(epochOf(i) + Math.round(minutes) * MS_PER_MINUTE);
}

/**
 * `"45"` · `"45m"` · `"1h"` · `"1h30m"` · `"1h 30"` · `"1.5h"` · `"2:30"` → minutes.
 * A bare number is minutes. Returns `null` (never a throw or a silent `0`) for
 * anything it cannot read.
 */
export function parseDuration(input: string): Minutes | null {
  const text = input.trim().toLowerCase();
  if (text === "") return null;

  // "2:30" — the clock-ish form, hours and whole minutes.
  const clock = /^(\d+):([0-5]\d)$/.exec(text);
  if (clock) {
    return Number(clock[1]) * 60 + Number(clock[2]);
  }

  // "1h 30m", "1h30", "90m", "90", "1.5h". A bare number falls to the minutes group.
  const parts =
    /^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+(?:\.\d+)?)\s*(?:m(?:in(?:ute)?s?)?)?)?$/.exec(
      text,
    );
  if (!parts || (parts[1] === undefined && parts[2] === undefined)) return null;

  const hours = parts[1] === undefined ? 0 : Number(parts[1]);
  const minutes = parts[2] === undefined ? 0 : Number(parts[2]);
  const total = Math.round(hours * 60 + minutes);

  return Number.isFinite(total) ? total : null;
}
