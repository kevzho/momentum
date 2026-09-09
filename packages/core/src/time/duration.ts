import type { Instant, Minutes } from "../types/scalars";
import { epochOf, instantFromEpoch, MS_PER_MINUTE, MS_PER_SECOND } from "./internal";

/**
 * Elapsed-time arithmetic. No timezone parameter, and none is needed: the
 * distance between two instants is the same number everywhere on Earth.
 *
 * This is where elapsed time and wall-clock time part company. A block
 * scheduled 01:00–02:00 on a spring-forward morning in New York reads as one
 * hour on the grid but is 0 minutes of `durationMinutes`; the same block on
 * the fall-back morning is 120. Capacity, focus, and estimate-versus-actual
 * maths all want the elapsed number, because that is how much of the user's
 * week the block actually consumes (Domain Rule 3).
 */

/** Negative when `end` precedes `start`. Rounded because `Minutes` is a whole number. */
export function durationMinutes(start: Instant, end: Instant): Minutes {
  return Math.round((epochOf(end) - epochOf(start)) / MS_PER_MINUTE);
}

/**
 * The same distance, in whole seconds, truncated toward zero.
 *
 * A focus timer is the one thing in the product that needs sub-minute
 * resolution: it is read once a second, and `durationMinutes`' rounding would
 * make a session read "25:00 remaining" for the first thirty seconds and then
 * jump. Truncation rather than rounding, so a second is only counted once it
 * has fully elapsed and the number never runs ahead of the clock
 * (`packages/core/src/focus/timer.ts` is the only caller).
 *
 * Negative when `end` precedes `start`; the focus module clamps, because what
 * an inverted span means is a question for the caller and not for arithmetic.
 */
export function durationSeconds(start: Instant, end: Instant): number {
  return Math.trunc((epochOf(end) - epochOf(start)) / MS_PER_SECOND);
}

/**
 * Shifts an instant by elapsed minutes. `minutes` may be negative.
 *
 * Deliberately *not* the way to move a block to "the same time tomorrow": that
 * is a wall-clock question and adding 1440 gets it wrong twice a year. Use
 * `fromLocal(addDays(date, 1), minutes, tz)`.
 */
export function addMinutes(i: Instant, minutes: Minutes): Instant {
  return instantFromEpoch(epochOf(i) + Math.round(minutes) * MS_PER_MINUTE);
}

/**
 * `"45"` · `"45m"` · `"1h"` · `"1h30m"` · `"1h 30"` · `"1.5h"` · `"2:30"` → minutes.
 *
 * The typed half of `formatDuration`, and the reason `DurationInput` was
 * deferred to the phase that needed it (docs/DESIGN_SYSTEM.md). An estimate is
 * typed far more often than it is read, so every shape a person actually types
 * is accepted rather than one canonical form being enforced by rejection.
 *
 * Returns `null` — never a throw and never a silent `0` — for anything it
 * cannot read, so a field can distinguish "empty" from "not a duration" and say
 * so next to the input. A bare number is minutes, because "45" in an estimate
 * field means 45 minutes to everyone; `1.5h` is the one fractional form, since
 * fractional *minutes* are not a thing `Minutes` can hold.
 */
export function parseDuration(input: string): Minutes | null {
  const text = input.trim().toLowerCase();
  if (text === "") return null;

  // "2:30" — the clock-ish form, hours and whole minutes.
  const clock = /^(\d+):([0-5]\d)$/.exec(text);
  if (clock) {
    return Number(clock[1]) * 60 + Number(clock[2]);
  }

  // "1h 30m", "1h30", "90m", "90", "1.5h". Either part may be absent, but not
  // both, and a bare number falls to the minutes group.
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
