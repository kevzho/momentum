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

// A partial patch, the same shape as `ProfileSettingsPatch` in `@momentum/db`.
// `xp`, `level` and `coins` are absent because they are guarded columns.

/** Mirrors `profiles_display_name_chk`. Empty is allowed: the shell falls back to the email. */
const displayName = z.string().trim().max(80, "Display names are at most 80 characters.");

/** Validated against the runtime's tz database, the same test the profile trigger applies. */
const timezone = z
  .string()
  .trim()
  .refine(isIanaTimeZone, "That is not a timezone Momentum recognises.")
  .transform((value) => ianaTimeZone(value));

/** `0` = Sunday … `6` = Saturday, as `Weekday` and `profiles_week_start_chk` both define it. */
const weekStart = z.literal(WEEKDAYS, "Week start is a day of the week.");

/** Mirrors `profiles_snap_minutes_chk`. */
const snapMinutes = z.literal(SNAP_MINUTES, "Snapping is 5, 10, 15 or 30 minutes.");

/** Validated before it is branded, so `localTime()` (which throws) only sees strings it accepts. */
const localTimeField = z
  .string()
  .refine(isLocalTime, "Times are HH:MM.")
  .transform((value) => localTime(value));

// Total on purpose: zod runs this check even when a field has already failed
// its own, so an invalid end is that field's issue and not also this one's.
const timeWindow = z.object({ start: localTimeField, end: localTimeField }).refine(
  (window) => {
    const start = minutesOfLocalTimeValue(window.start);
    const end = minutesOfLocalTimeValue(window.end);
    return start === null || end === null || start < end;
  },
  { message: "A window has to end after it starts.", path: ["end"] },
);

// Overlapping and touching windows are merged, not rejected. The bound is
// checked on the input, before the merge.
const timeWindows = z
  .array(timeWindow)
  .max(6, "At most six windows a day.")
  .transform((windows): TimeWindow[] => normaliseWindows(windows));

// Spelled out so the compiler checks the keys against `WorkingHours`. A
// missing day is an error, not an empty day.
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
    focusWindows: timeWindows.optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: "Nothing to save.",
  });

export type UpdateProfileSettingsInput = z.infer<typeof updateProfileSettingsInput>;

/** Sorts windows by start and merges any that overlap or touch. */
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
