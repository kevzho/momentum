import type { ProjectColor } from "./project";
import type { Instant, LocalDate, LocalTime, Minutes, Uuid, Weekday } from "./scalars";

/**
 * daily            once every day                       target = 1, unit = count
 * weekdays         once on each of `activeDays`         target = 1, unit = count
 * times_per_week   N days per week, any days            target = N, unit = count
 * amount_per_day   N minutes / N count per day          target = N, unit = minutes | count
 * amount_per_week  N minutes / N count per week         target = N, unit = minutes | count
 */
export const HABIT_FREQUENCY_TYPES = [
  "daily",
  "weekdays",
  "times_per_week",
  "amount_per_day",
  "amount_per_week",
] as const;
export type HabitFrequencyType = (typeof HABIT_FREQUENCY_TYPES)[number];

export const HABIT_AMOUNT_UNITS = ["count", "minutes"] as const;
export type HabitAmountUnit = (typeof HABIT_AMOUNT_UNITS)[number];

export interface Habit {
  id: Uuid;
  userId: Uuid;
  name: string;
  description: string | null;
  frequencyType: HabitFrequencyType;
  /** Meaning depends on `frequencyType`; see the table above. */
  target: number;
  unit: HabitAmountUnit;
  /** Only meaningful for `weekdays`; empty otherwise. */
  activeDays: Weekday[];
  preferredStartTime: LocalTime | null;
  /** Duration of a generated habit block. */
  estimatedMinutes: Minutes | null;
  xpReward: number;
  color: ProjectColor | null;
  archivedAt: Instant | null;
  createdAt: Instant;
  updatedAt: Instant;
}

/**
 * Exactly one row per habit per user-local date, for every frequency type.
 * `amount` accumulates within the day. Completing from the calendar and from the
 * habits page upsert the same row (Domain Rule 13).
 */
export interface HabitCompletion {
  id: Uuid;
  habitId: Uuid;
  userId: Uuid;
  /** Computed in the user's timezone at completion time. A date, not an instant (Domain Rule 4). */
  completionDate: LocalDate;
  amount: number;
  /** The habit block this completion was recorded from, if any. */
  sourceBlockId: Uuid | null;
  completedAt: Instant;
}
