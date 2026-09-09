"use client";

import type { TimeWindow, Weekday, WorkingHours } from "@momentum/core/types";

import { TimeWindowList } from "@/features/settings/components/time-window-list";
import { WEEKDAY_NAMES, weekdaysFrom } from "@/features/settings/weekday-names";

/**
 * Seven rows, one per weekday, each a `TimeWindowList`.
 *
 * The rows run in the user's own week order — Monday first for a
 * Monday-week profile, Sunday first for a Sunday-week one — because the
 * calendar's columns do, and a settings page that listed the days in a
 * different order from the grid they configure would make the user translate.
 * Week start is a setting, never a constant (Domain Rule 4).
 *
 * A day with no windows is a day off: capacity for it is zero, and Find Time
 * places nothing on it. The row says so in words rather than showing an empty
 * list, which could as easily mean "not configured".
 *
 * Every edit reports the whole `WorkingHours` object through one `onChange`;
 * the page sends that as one field in one write.
 */
export interface WorkingHoursEditorProps {
  value: WorkingHours;
  weekStart: Weekday;
  /** True while a write of the working hours is in flight. */
  disabled?: boolean;
  onChange: (next: WorkingHours) => void;
}

export function WorkingHoursEditor({
  value,
  weekStart,
  disabled = false,
  onChange,
}: WorkingHoursEditorProps) {
  return (
    <div role="group" aria-label="Working hours" className="flex flex-col gap-3">
      {weekdaysFrom(weekStart).map((day) => (
        <div key={day} className="flex items-start gap-3">
          <span className="w-24 shrink-0 pt-1.5 text-sm font-medium">{WEEKDAY_NAMES[day]}</span>
          <TimeWindowList
            id={`working-hours-${day}`}
            label={WEEKDAY_NAMES[day]}
            windows={value[day]}
            emptyLabel="Day off"
            disabled={disabled}
            onChange={(windows) => onChange(withDay(value, day, windows))}
          />
        </div>
      ))}
    </div>
  );
}

/** A copy of `hours` with one day replaced; the other six are untouched. */
function withDay(hours: WorkingHours, day: Weekday, windows: TimeWindow[]): WorkingHours {
  const next: WorkingHours = { ...hours };
  next[day] = windows;
  return next;
}
