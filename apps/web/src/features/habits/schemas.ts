import { z } from "zod";

import { HABIT_AMOUNT_UNITS, HABIT_FREQUENCY_TYPES, PROJECT_COLORS } from "@momentum/core/types";
import { isLocalDate, isLocalTime, localDate, localTime } from "@momentum/core/time";

/**
 * Input schemas shared by the habit actions and forms. They mirror the
 * `habits` table's check constraints, so a form that passes here is a row
 * Postgres will accept; the cross-field shape rules are refinements.
 */

const uuid = z.uuid("That is not a valid id.");

const localDateField = z
  .string()
  .refine(isLocalDate, "Dates are YYYY-MM-DD.")
  .transform((value) => localDate(value));

const localTimeField = z
  .string()
  .refine(isLocalTime, "Times are HH:MM.")
  .transform((value) => localTime(value));

/** 0..6, Sunday first. A union of literals so the parsed value *is* a `Weekday`. */
const weekday = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

const habitFields = {
  name: z.string().trim().min(1, "Give the habit a name.").max(100, "At most 100 characters."),
  description: z.string().trim().max(2000).nullable().default(null),
  frequencyType: z.enum(HABIT_FREQUENCY_TYPES),
  target: z.number().int().min(1, "A target is at least 1.").max(1000),
  unit: z.enum(HABIT_AMOUNT_UNITS),
  activeDays: z.array(weekday).max(7),
  preferredStartTime: localTimeField.nullable().default(null),
  estimatedMinutes: z
    .number()
    .int()
    .min(1, "A session is at least a minute.")
    .max(720, "A session is at most 12 hours.")
    .nullable()
    .default(null),
  xpReward: z.number().int().min(0).max(50),
  color: z.enum(PROJECT_COLORS).nullable().default(null),
};

/** Shape rules shared by the create and edit schemas, so neither can break a rule the other holds. */
function checkShape(
  value: {
    frequencyType: (typeof HABIT_FREQUENCY_TYPES)[number];
    target: number;
    unit: (typeof HABIT_AMOUNT_UNITS)[number];
    activeDays: readonly number[];
  },
  ctx: z.RefinementCtx,
): void {
  if (value.frequencyType === "weekdays" && value.activeDays.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["activeDays"],
      message: "Choose at least one day.",
    });
  }

  if (
    (value.frequencyType === "daily" || value.frequencyType === "weekdays") &&
    value.target !== 1
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["target"],
      message: "This habit is done once on each of its days.",
    });
  }

  const isAmount =
    value.frequencyType === "amount_per_day" || value.frequencyType === "amount_per_week";
  if (!isAmount && value.unit !== "count") {
    ctx.addIssue({
      code: "custom",
      path: ["unit"],
      message: "Only an amount habit is measured in minutes.",
    });
  }
}

/** Id is client-generated so a retried create collides with itself. */
export const createHabitInput = z.object({ id: uuid, ...habitFields }).superRefine(checkShape);

export const updateHabitInput = z.object({ id: uuid, ...habitFields }).superRefine(checkShape);

export const archiveHabitInput = z.object({ id: uuid, archived: z.boolean() });

export const deleteHabitInput = z.object({ id: uuid });

/** `date` is the recorded day in the user's timezone: a calendar date, never an instant. */
export const setHabitCompletionInput = z.object({
  habitId: uuid,
  date: localDateField,
  recorded: z.boolean(),
  amount: z.number().int().min(1).max(10_000).default(1),
});

/**
 * The week is named by its first date so a replay asks for the same week. No
 * client block ids: the plan is differenced against existing blocks, so a
 * retry creates nothing twice.
 */
export const addHabitToWeekInput = z.object({
  habitId: uuid,
  weekStartDate: localDateField,
});
