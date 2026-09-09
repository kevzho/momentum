import { WEEKDAYS, type Weekday } from "@momentum/core/types";

/** The seven day names, keyed the way `Weekday` is (`0` = Sunday). A label table, not date arithmetic. */
export const WEEKDAY_NAMES: Record<Weekday, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

/** The seven weekdays starting from `weekStart`, in the order the user's week runs. */
export function weekdaysFrom(weekStart: Weekday): Weekday[] {
  return [...WEEKDAYS.slice(weekStart), ...WEEKDAYS.slice(0, weekStart)];
}
