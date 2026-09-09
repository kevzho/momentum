import { z } from "zod";

import {
  ianaTimeZone,
  isIanaTimeZone,
  isLocalTime,
  localTime,
  minutesOfLocalTime,
  minutesOfLocalTimeValue,
} from "@momentum/core/time";
import { SNAP_MINUTES, WEEKDAYS, type TimeWindow, type WorkingHours } from "@momentum/core/types";

/**
 * What the settings page's one server action accepts.
 *
 * A partial patch, the same shape as `ProfileSettingsPatch` in `@momentum/db`:
 * every control on the page commits on its own, so a write carries the one
 * field that changed and nothing else. That is what keeps a slow save of the
 * display name from overwriting a working-hours edit made while it was in
 * flight — the two patches touch different columns.
 *
 * `xp`, `level` and `coins` are absent because they are guarded columns
 * (Domain Rule 15); a crafted request naming them is a validation error here
 * and a trigger violation in the database, in that order.
 */

/**
 * Mirrors `profiles_display_name_chk`. An empty name is allowed — the column
 * defaults to it, and the shell falls back to the email address — so clearing
 * the field means "use my address", not an error.
 */
const displayName = z.string().trim().max(80, "Display names are at most 80 characters.");

/**
 * Validated against the runtime's own tz database, which is the same test the
 * profile trigger applies in Postgres; a zone that passes here and fails there
 * is a version skew the action maps back to the same message.
 */
const timezone = z
  .string()
  .trim()
  .refine(isIanaTimeZone, "That is not a timezone Momentum recognises.")
  .transform((value) => ianaTimeZone(value));

/** `0` = Sunday … `6` = Saturday, as `Weekday` and `profiles_week_start_chk` both define it. */
const weekStart = z.literal(WEEKDAYS, "Week start is a day of the week.");

/** Mirrors `profiles_snap_minutes_chk`. */
const snapMinutes = z.literal(SNAP_MINUTES, "Snapping is 5, 10, 15 or 30 minutes.");

/**
 * A wall-clock time, narrowed to the branded `LocalTime`. Validated before it
 * is branded, so `localTime()` — which throws — is only ever reached with a
 * string it accepts.
 */
const localTimeField = z
  .string()
  .refine(isLocalTime, "Times are HH:MM.")
  .transform((value) => localTime(value));

/**
 * A window that moves forward. Compared as minutes from midnight through the
 * time module rather than as strings — the strings happen to sort the same
 * way, but that is a property of zero-padded `HH:MM` the reader should not
 * have to know (Domain Rule 5).
 *
 * Total on purpose: zod runs this check even when one of the fields has
 * already failed its own, so an end that is not a time is that field's issue
 * and not, additionally, this one's.
 */
const timeWindow = z.object({ start: localTimeField, end: localTimeField }).refine(
  (window) => {
    const start = minutesOfLocalTimeValue(window.start);
    const end = minutesOfLocalTimeValue(window.end);
    return start === null || end === null || start < end;
  },
  { message: "A window has to end after it starts.", path: ["end"] },
);

/**
 * A day's windows, stored in canonical form.
 *
 * Overlapping and touching windows are **merged**, not rejected. The stored
 * value is what the capacity and Find Time maths read, and to them
 * `09:00–12:00` plus `11:00–15:00` is exactly `09:00–15:00`; refusing the
 * input would make the user express the same fact in the one spelling the
 * schema happens to prefer. Sorting by start makes two profiles that mean the
 * same hours compare equal, which is what lets the editor re-seed its rows
 * from the server's answer without a spurious change.
 *
 * Six windows a day is a bound on the input, checked before the merge: a day
 * split into more pieces than that is not a working pattern anyone has, and
 * an unbounded array is an unbounded row.
 */
const timeWindows = z
  .array(timeWindow)
  .max(6, "At most six windows a day.")
  .transform((windows): TimeWindow[] => normaliseWindows(windows));

/**
 * The seven keys `Record<Weekday, TimeWindow[]>` has, spelled out so the
 * compiler checks them against `WorkingHours` rather than trusting a loop.
 * A missing day is an error, not an empty day: the mapper in `@momentum/db`
 * always writes all seven, and a client that sends fewer has a bug.
 */
const workingHours = z.object({
  0: timeWindows,
  1: timeWindows,
  2: timeWindows,
  3: timeWindows,
  4: timeWindows,
  5: timeWindows,
  6: timeWindows,
}) satisfies z.ZodType<WorkingHours, unknown>;

export const updateProfileSettingsInput = z
  .object({
    displayName: displayName.optional(),
    timezone: timezone.optional(),
    weekStart: weekStart.optional(),
    snapMinutes: snapMinutes.optional(),
    workingHours: workingHours.optional(),
    /** Preferred deep-focus windows: the same rules as one day's working hours. */
    focusWindows: timeWindows.optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: "Nothing to save.",
  });

export type UpdateProfileSettingsInput = z.infer<typeof updateProfileSettingsInput>;

/**
 * Sorts windows by start and merges any that overlap or touch, so the result
 * is the shortest list that covers the same minutes. Exported so the merge
 * rule can be tested on its own; the page never calls it, because it shows
 * whatever the server stored rather than predicting it.
 */
export function normaliseWindows(windows: readonly TimeWindow[]): TimeWindow[] {
  const sorted = [...windows].sort(
    (a, b) => minutesOfLocalTime(a.start) - minutesOfLocalTime(b.start),
  );

  const merged: TimeWindow[] = [];
  for (const window of sorted) {
    const last = merged.at(-1);
    if (last !== undefined && minutesOfLocalTime(window.start) <= minutesOfLocalTime(last.end)) {
      if (minutesOfLocalTime(window.end) > minutesOfLocalTime(last.end)) {
        merged[merged.length - 1] = { start: last.start, end: window.end };
      }
      continue;
    }
    merged.push({ start: window.start, end: window.end });
  }
  return merged;
}
