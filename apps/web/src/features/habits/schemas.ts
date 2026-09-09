import { z } from "zod";

import { HABIT_AMOUNT_UNITS, HABIT_FREQUENCY_TYPES, PROJECT_COLORS } from "@momentum/core/types";
import { isLocalDate, isLocalTime, localDate, localTime } from "@momentum/core/time";

/**
 * The habits feature's input schemas, shared by the server actions and the
 * forms that call them (docs/ARCHITECTURE.md §6).
 *
 * They mirror the database's own constraints rather than inventing a second set
 * — `habits_name_chk`, `habits_target_positive_chk`, `habits_estimate_chk`,
 * `habits_xp_reward_chk` and the three shape checks — so a form that passes
 * here is a row Postgres will accept, and the constraint messages in
 * `actions.ts` are a backstop rather than the primary validation.
 *
 * The three shape rules are expressed as refinements because they are relations
 * between fields and not properties of one:
 *
 *   `weekdays`                  needs at least one active day
 *   `daily` and `weekdays`      have a target of exactly 1 — "once" is not a number
 *                               the user types
 *   only the two `amount_*`     types may carry a unit other than `count`
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

/**
 * 0..6, Sunday first — the `Weekday` domain (docs/ARCHITECTURE.md §3).
 *
 * A union of literals rather than a bounded number, so the parsed value *is* a
 * `Weekday` and the action never has to assert one.
 */
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

/**
 * The shape rules, applied to whatever subset of the fields is present.
 *
 * `superRefine` rather than three schemas, because the create form and the edit
 * form send the same fields and a rule that lived in only one of them would be
 * a rule the other could break.
 */
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

/** Id is client-generated so a retried create collides with itself (Domain Rule 17). */
export const createHabitInput = z.object({ id: uuid, ...habitFields }).superRefine(checkShape);

export const updateHabitInput = z.object({ id: uuid, ...habitFields }).superRefine(checkShape);

export const archiveHabitInput = z.object({ id: uuid, archived: z.boolean() });

export const deleteHabitInput = z.object({ id: uuid });

/**
 * Recording or un-recording one day.
 *
 * `date` is the day being recorded, in the user's timezone — the client sends a
 * calendar date and never an instant, and the database re-checks it against its
 * own idea of the user's today (Domain Rule 4).
 */
export const setHabitCompletionInput = z.object({
  habitId: uuid,
  date: localDateField,
  recorded: z.boolean(),
  amount: z.number().int().min(1).max(10_000).default(1),
});

/**
 * "Add to week".
 *
 * The week is named by its first date rather than by an offset, so replaying
 * the action later asks for the same week rather than for whatever week it is
 * replayed in.
 *
 * There are no client-generated block ids here, and that is not an exception to
 * Domain Rule 17 — it is the same guarantee reached differently. This action
 * does not create a row the client is already showing; it asks the server what
 * the week is missing. The plan is differenced against the blocks that already
 * exist, so a retry whose first attempt succeeded finds nothing left to create
 * and returns an empty list rather than a second set of blocks.
 */
export const addHabitToWeekInput = z.object({
  habitId: uuid,
  weekStartDate: localDateField,
});
