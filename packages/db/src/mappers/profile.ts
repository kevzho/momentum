import { ianaTimeZone, isLocalTime, localTime } from "@momentum/core/time";
import {
  SNAP_MINUTES,
  WEEKDAYS,
  type Profile,
  type SnapMinutes,
  type TimeWindow,
  type Weekday,
  type WorkingHours,
} from "@momentum/core/types";

import type { Json, Row, UpdateRow } from "../types";
import { isJsonArray, isJsonObject, oneOf, toInstant, toInstantOrNull } from "./scalars";

/** `working_hours` and `focus_windows` are loosely typed jsonb; malformed entries are dropped, never passed on. */

const EMPTY_WORKING_HOURS: WorkingHours = {
  0: [],
  1: [],
  2: [],
  3: [],
  4: [],
  5: [],
  6: [],
};

function toTimeWindow(value: Json): TimeWindow | null {
  if (!isJsonObject(value)) return null;
  const { start, end } = value;
  if (typeof start !== "string" || typeof end !== "string") return null;
  if (!isLocalTime(start) || !isLocalTime(end)) return null;
  const window = { start: localTime(start), end: localTime(end) };
  return window.start < window.end ? window : null;
}

function toTimeWindows(value: Json | undefined): TimeWindow[] {
  if (!isJsonArray(value)) return [];
  return value.map(toTimeWindow).filter((window): window is TimeWindow => window !== null);
}

export function parseWorkingHours(value: Json): WorkingHours {
  const hours: WorkingHours = { ...EMPTY_WORKING_HOURS };
  if (!isJsonObject(value)) return hours;

  for (const weekday of WEEKDAYS) {
    hours[weekday] = toTimeWindows(value[String(weekday)]);
  }

  return hours;
}

export function parseFocusWindows(value: Json): TimeWindow[] {
  return toTimeWindows(value);
}

export function rowToProfile(row: Row<"profiles">): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    timezone: ianaTimeZone(row.timezone),
    weekStart: oneOf<Weekday>(WEEKDAYS, row.week_start, "profiles.week_start"),
    workingHours: parseWorkingHours(row.working_hours),
    focusWindows: parseFocusWindows(row.focus_windows),
    snapMinutes: oneOf<SnapMinutes>(SNAP_MINUTES, row.snap_minutes, "profiles.snap_minutes"),
    level: row.level,
    xp: row.xp,
    coins: row.coins,
    workingHoursSetAt: toInstantOrNull(row.working_hours_set_at),
    onboardingDismissedAt: toInstantOrNull(row.onboarding_dismissed_at),
    createdAt: toInstant(row.created_at),
    updatedAt: toInstant(row.updated_at),
  };
}

/** The settings a user may change. xp, level and coins are guarded columns and are absent by design. */
export interface ProfileSettingsPatch {
  displayName?: string;
  timezone?: string;
  weekStart?: Weekday;
  workingHours?: WorkingHours;
  focusWindows?: TimeWindow[];
  snapMinutes?: SnapMinutes;
}

function toJsonWindows(windows: readonly TimeWindow[]): Json {
  return windows.map((window) => ({ start: String(window.start), end: String(window.end) }));
}

export function profileSettingsToUpdate(patch: ProfileSettingsPatch): UpdateRow<"profiles"> {
  const update: UpdateRow<"profiles"> = {};

  if (patch.displayName !== undefined) update.display_name = patch.displayName;
  if (patch.timezone !== undefined) update.timezone = patch.timezone;
  if (patch.weekStart !== undefined) update.week_start = patch.weekStart;
  if (patch.snapMinutes !== undefined) update.snap_minutes = patch.snapMinutes;

  const workingHours = patch.workingHours;
  if (workingHours !== undefined) {
    update.working_hours = Object.fromEntries(
      WEEKDAYS.map((weekday) => [String(weekday), toJsonWindows(workingHours[weekday])]),
    );
  }
  if (patch.focusWindows !== undefined) {
    update.focus_windows = toJsonWindows(patch.focusWindows);
  }

  return update;
}
