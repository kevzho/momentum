import { WEEKDAYS, type Weekday } from "@momentum/core/types";

/**
 * The seven day names, keyed the way `Weekday` is (`0` = Sunday).
 *
 * A label table, not date arithmetic: nothing here resolves a date, so it has
 * no timezone to get wrong and no reason to live in `@momentum/core/time`. It
 * is the one place the settings page turns a weekday number into a word, so
 * the week-start select and the working-hours rows cannot spell a day
 * differently.
 */
export const WEEKDAY_NAMES: Record<Weekday, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

/**
 * The seven weekdays starting from `weekStart`, in the order the user's week
 * runs. `WEEKDAYS` is `[0..6]`, so rotating it is the whole computation.
 */
export function weekdaysFrom(weekStart: Weekday): Weekday[] {
  return [...WEEKDAYS.slice(weekStart), ...WEEKDAYS.slice(0, weekStart)];
}
