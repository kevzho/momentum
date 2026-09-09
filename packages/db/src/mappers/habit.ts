import {
  HABIT_AMOUNT_UNITS,
  HABIT_FREQUENCY_TYPES,
  PROJECT_COLORS,
  WEEKDAYS,
  type Habit,
  type HabitAmountUnit,
  type HabitCompletion,
  type HabitFrequencyType,
  type ProjectColor,
  type Weekday,
} from "@momentum/core/types";

import type { Row } from "../types";
import { oneOf, toInstant, toInstantOrNull, toLocalDate, toLocalTimeOrNull } from "./scalars";

export function rowToHabit(row: Row<"habits">): Habit {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    frequencyType: oneOf<HabitFrequencyType>(
      HABIT_FREQUENCY_TYPES,
      row.frequency_type,
      "habits.frequency_type",
    ),
    target: row.target,
    unit: oneOf<HabitAmountUnit>(HABIT_AMOUNT_UNITS, row.unit, "habits.unit"),
    activeDays: row.active_days.map((day) => oneOf<Weekday>(WEEKDAYS, day, "habits.active_days")),
    preferredStartTime: toLocalTimeOrNull(row.preferred_start_time),
    estimatedMinutes: row.estimated_minutes,
    xpReward: row.xp_reward,
    color:
      row.color === null ? null : oneOf<ProjectColor>(PROJECT_COLORS, row.color, "habits.color"),
    archivedAt: toInstantOrNull(row.archived_at),
    createdAt: toInstant(row.created_at),
    updatedAt: toInstant(row.updated_at),
  };
}

export function rowToHabitCompletion(row: Row<"habit_completions">): HabitCompletion {
  return {
    id: row.id,
    habitId: row.habit_id,
    userId: row.user_id,
    completionDate: toLocalDate(row.completion_date),
    amount: row.amount,
    sourceBlockId: row.source_block_id,
    completedAt: toInstant(row.completed_at),
  };
}
