import { z } from "zod";

import { isLocalDate, localDate } from "@momentum/core/time";
import { PROJECT_COLORS, RECURRENCE_FREQUENCIES, WEEKDAYS } from "@momentum/core/types";

/**
 * What the calendar's server actions accept. Actions take wall-clock spans,
 * never instants: the server applies the profile timezone. Ids are
 * client-generated so the optimistic and persisted rows share a key.
 */

const uuid = z.uuid("That is not a valid id.");

// Validated before branding: `localDate()` throws on a string it rejects.
const localDateField = z
  .string()
  .refine(isLocalDate, "Dates are YYYY-MM-DD.")
  .transform((value) => localDate(value));

// Bounded because `fromLocal` would normalise an overflow into the next day.
// A start is always inside its day; an end may run up to a day past it,
// because a midnight-crossing block ends past 1440 and the editor must save it.
const startMinuteOfDay = z
  .number()
  .int("Times are whole minutes.")
  .min(0, "That time is before the start of the day.")
  .max(1440, "That time is after the end of the day.");

const endMinuteOfDay = z
  .number()
  .int("Times are whole minutes.")
  .min(0, "That time is before the start of the day.")
  .max(2880, "A block cannot run more than a day past the time it started.");

const color = z.enum(PROJECT_COLORS).nullable();

// Lengths are application hygiene, not database constraints.
const title = z
  .string()
  .trim()
  .min(1, "Give the event a name.")
  .max(200, "Titles are at most 200 characters.");

const description = z
  .string()
  .trim()
  .max(2000, "Descriptions are at most 2000 characters.")
  .nullable();

/** The half-open wall-clock span every interaction produces. */
const span = {
  date: localDateField,
  startMinutes: startMinuteOfDay,
  endMinutes: endMinuteOfDay,
};

/** `end > start`, mirroring `blocks_span_chk`, so the form gets a field error rather than a constraint violation. */
function orderedSpan<T extends { startMinutes: number; endMinutes: number }>(schema: z.ZodType<T>) {
  return schema.refine((value) => value.endMinutes > value.startMinutes, {
    message: "A block has to end after it starts.",
    path: ["endMinutes"],
  });
}

/** Minutes in a day; an all-day block is exactly this span. */
const WHOLE_DAY = 1440;

/**
 * An all-day block is stored the way the seed stores one: local midnight to
 * the next, flagged. The span is required to say so rather than normalised,
 * so a caller cannot send a timed span with the flag and get something else.
 */
function wholeDayWhenAllDay<
  T extends { startMinutes: number; endMinutes: number; allDay?: boolean | undefined },
>(schema: z.ZodType<T>) {
  return schema.refine(
    (value) =>
      value.allDay !== true || (value.startMinutes === 0 && value.endMinutes === WHOLE_DAY),
    { message: "An all-day block spans its whole day.", path: ["allDay"] },
  );
}

const weekday = z.literal([...WEEKDAYS]);

/**
 * The rule a user can set on an event. The server adds the series timezone
 * (Domain Rule 16); `validate_recurrence` re-checks the shape on write.
 */
export const recurrenceInput = z
  .object({
    freq: z.enum(RECURRENCE_FREQUENCIES),
    interval: z
      .number()
      .int("Every how many is a whole number.")
      .min(1, "Repeat at least every 1.")
      .max(52, "Repeat at most every 52."),
    byWeekday: z.array(weekday).min(1, "Pick at least one day.").max(7).nullable(),
    until: localDateField.nullable(),
    count: z.number().int().min(1, "At least once.").max(365, "At most 365 times.").nullable(),
  })
  .refine((rule) => rule.until === null || rule.count === null, {
    message: "A rule ends on a date or after a number of times, not both.",
    path: ["count"],
  })
  .refine((rule) => rule.freq === "weekly" || rule.byWeekday === null, {
    message: "Days of the week apply to a weekly rule.",
    path: ["byWeekday"],
  })
  .transform((rule) => ({
    ...rule,
    byWeekday: rule.byWeekday === null ? null : [...new Set(rule.byWeekday)].sort((a, b) => a - b),
  }));

/**
 * Only events are created from the grid; work blocks come from `scheduleTask`
 * and habit blocks are generated. `kind` is a literal so a crafted request
 * cannot ask for a shape with no parent.
 */
export const createBlockInput = wholeDayWhenAllDay(
  orderedSpan(
    z
      .object({
        id: uuid,
        kind: z.literal("event"),
        title,
        description,
        color,
        ...span,
        /** A whole day with no clock time: an exam date, a deadline on the calendar. */
        allDay: z.boolean().default(false),
        recurrence: recurrenceInput.nullable().default(null),
      })
      .refine(
        (value) =>
          value.recurrence === null ||
          value.recurrence.until === null ||
          value.recurrence.until >= value.date,
        { message: "The rule ends before the event starts.", path: ["recurrence", "until"] },
      ),
  ),
);

/**
 * Content only; times move through `rescheduleBlock`, completion through
 * `setBlockCompletion`. `title` is optional because only an event owns one:
 * work and habit blocks keep `''` so the parent's name resolves on read.
 */
export const updateBlockInput = z.object({
  id: uuid,
  title: title.optional(),
  description,
  color,
  /** Omitted: untouched. Null: stops repeating. Only an event series row may carry one. */
  recurrence: recurrenceInput.nullable().optional(),
});

/**
 * Move and resize are one write, so a block never shows as moved but not yet
 * resized. `allDay` omitted leaves the flag as it is; a drag never sends one.
 */
export const rescheduleBlockInput = wholeDayWhenAllDay(
  orderedSpan(z.object({ id: uuid, ...span, allDay: z.boolean().optional() })),
);

export const deleteBlockInput = z.object({ id: uuid });

/** `id` is the new block's; `taskId` is the task it reserves time for. */
export const scheduleTaskInput = orderedSpan(z.object({ id: uuid, taskId: uuid, ...span }));

/**
 * `alsoCompleteTask`: completing this block also completes the task.
 * `alsoUncompleteTask`: un-completing it reopens the task. Each is ignored in
 * the other direction.
 */
export const setBlockCompletionInput = z.object({
  id: uuid,
  completed: z.boolean(),
  alsoCompleteTask: z.boolean().default(false),
  alsoUncompleteTask: z.boolean().default(false),
  /**
   * Routes a habit block to `complete_habit_block`, which also records the
   * habit's day. A hint, not an authorisation: the database refuses with
   * `22023` if the block is not a habit block.
   */
  habitId: uuid.nullable().default(null),
});

/**
 * An override row is keyed to the date the *rule* produced, not the date it
 * moves to, so `occurrenceDate` and `date` routinely differ.
 */
export const rescheduleOccurrenceInput = orderedSpan(
  z.object({ seriesId: uuid, occurrenceDate: localDateField, ...span }),
);

/** Deleting one occurrence writes a cancelled override; the series is untouched. */
export const deleteOccurrenceInput = z.object({
  seriesId: uuid,
  occurrenceDate: localDateField,
});

export type RecurrenceInput = z.infer<typeof recurrenceInput>;
export type CreateBlockInput = z.infer<typeof createBlockInput>;
export type UpdateBlockInput = z.infer<typeof updateBlockInput>;
export type RescheduleBlockInput = z.infer<typeof rescheduleBlockInput>;
export type DeleteBlockInput = z.infer<typeof deleteBlockInput>;
export type ScheduleTaskInput = z.infer<typeof scheduleTaskInput>;
export type SetBlockCompletionInput = z.infer<typeof setBlockCompletionInput>;
export type RescheduleOccurrenceInput = z.infer<typeof rescheduleOccurrenceInput>;
export type DeleteOccurrenceInput = z.infer<typeof deleteOccurrenceInput>;
