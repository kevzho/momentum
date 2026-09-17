"use client";

import type { TimeWindow, Weekday, WorkingHours } from "@momentum/core/types";
import { cn } from "@momentum/ui/lib/utils";

import { TimeWindowList } from "@/features/settings/components/time-window-list";
import { WEEKDAY_NAMES, weekdaysFrom } from "@/features/settings/weekday-names";

/**
 * Seven rows in the user's own week order, because the calendar's columns are.
 * A day with no windows is a day off: capacity is zero and Find Time places
 * nothing on it.
 */
export interface WorkingHoursEditorProps {
  value: WorkingHours;
  weekStart: Weekday;
  disabled?: boolean;
  /**
   * `row` puts the day name beside its windows and stacks them only on a
   * phone; `stacked` always stacks, for a narrow column such as the plan panel.
   */
  layout?: "row" | "stacked";
  onChange: (next: WorkingHours) => void;
}

export function WorkingHoursEditor({
  value,
  weekStart,
  disabled = false,
  layout = "row",
  onChange,
}: WorkingHoursEditorProps) {
  const stacked = layout === "stacked";

  return (
    <div role="group" aria-label="Working hours" className="flex flex-col gap-3">
      {weekdaysFrom(weekStart).map((day) => (
        <div
          key={day}
          className={cn(
            "flex",
            stacked ? "flex-col gap-1.5" : "items-start gap-3 max-sm:flex-col max-sm:gap-1.5",
          )}
        >
          <span className={cn("w-24 shrink-0 text-sm font-medium", !stacked && "sm:pt-1.5")}>
            {WEEKDAY_NAMES[day]}
          </span>
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

/** A copy of `hours` with one day replaced. */
function withDay(hours: WorkingHours, day: Weekday, windows: TimeWindow[]): WorkingHours {
  const next: WorkingHours = { ...hours };
  next[day] = windows;
  return next;
}
