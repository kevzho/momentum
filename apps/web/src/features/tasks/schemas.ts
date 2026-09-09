import { z } from "zod";

import { isLocalDate, localDate } from "@momentum/core/time";
import { TASK_PRIORITIES } from "@momentum/core/types";

// Ids are client-generated so a retry collides with itself; spans arrive as
// wall clock for the server to convert. A task has no `scheduledAt`: its time
// is a work block, created by `addWorkBlock` with its own id.

const uuid = z.uuid("That is not a valid id.");

const localDateField = z
  .string()
  .refine(isLocalDate, "Dates are YYYY-MM-DD.")
  .transform((value) => localDate(value));

/** Mirrors `tasks_title_chk`. */
const title = z
  .string()
  .trim()
  .min(1, "Give the task a title.")
  .max(500, "Titles are at most 500 characters.");

const description = z.string().trim().max(5000, "Notes are at most 5000 characters.").nullable();

const priority = z
  .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
  .describe(`One of ${TASK_PRIORITIES.join(", ")}; 4 means "no priority set".`);

/** Mirrors `tasks_estimate_chk`. */
const estimatedMinutes = z
  .number()
  .int("Estimates are whole minutes.")
  .positive("An estimate has to be more than zero.")
  .max(10080, "An estimate is at most one week.")
  .nullable();

/** Only a title is required. `parentTaskId` makes the same action create a subtask. */
export const createTaskInput = z.object({
  id: uuid,
  title,
  description: description.default(null),
  projectId: uuid.nullable().default(null),
  parentTaskId: uuid.nullable().default(null),
  priority: priority.default(4),
  estimatedMinutes: estimatedMinutes.default(null),
  dueDate: localDateField.nullable().default(null),
  /** Where in the manual order the new row goes. */
  sortOrder: z.number().finite().default(0),
});

/**
 * A partial patch. `status`, `completedAt` and `actualMinutes` are absent:
 * they are guarded columns and move only through the trusted functions.
 */
export const updateTaskInput = z.object({
  id: uuid,
  title: title.optional(),
  description: description.optional(),
  projectId: uuid.nullable().optional(),
  priority: priority.optional(),
  estimatedMinutes: estimatedMinutes.optional(),
  dueDate: localDateField.nullable().optional(),
});

export const setTaskCompletionInput = z.object({
  id: uuid,
  completed: z.boolean(),
});

export const deleteTaskInput = z.object({ id: uuid });

export const archiveTaskInput = z.object({ id: uuid, archived: z.boolean() });

/**
 * A manual reorder, as the rows it has to write: usually one, or the whole
 * tied run when the neighbours share a number. Bounded at 200 like the bulk actions.
 */
export const reorderTaskInput = z.object({
  orders: z
    .array(
      z.object({
        id: uuid,
        sortOrder: z.number().finite("That is not a position."),
      }),
    )
    .min(1, "Nothing to move.")
    .max(200, "That is more tasks than one move should change at once."),
});

// Bounded: an unbounded id list is an unbounded statement.
const ids = z
  .array(uuid)
  .min(1, "Select at least one task.")
  .max(200, "That is more tasks than one action should change at once.");

export const bulkCompleteInput = z.object({ ids, completed: z.boolean() });
export const bulkMoveInput = z.object({ ids, projectId: uuid.nullable() });
export const bulkDeleteInput = z.object({ ids });

/**
 * The same wall-clock span the calendar's actions take, converted server-side.
 * `endMinutes` may exceed 1440: a block ending past midnight ends e.g. 1470
 * minutes after its own day's midnight, which is how `queries.ts` reports it.
 */
export const addWorkBlockInput = z
  .object({
    id: uuid,
    taskId: uuid,
    date: localDateField,
    startMinutes: z.number().int().min(0).max(1440),
    endMinutes: z.number().int().min(0).max(2880),
  })
  .refine((value) => value.endMinutes > value.startMinutes, {
    message: "A block has to end after it starts.",
    path: ["endMinutes"],
  });

export const updateWorkBlockInput = z
  .object({
    id: uuid,
    date: localDateField,
    startMinutes: z.number().int().min(0).max(1440),
    endMinutes: z.number().int().min(0).max(2880),
  })
  .refine((value) => value.endMinutes > value.startMinutes, {
    message: "A block has to end after it starts.",
    path: ["endMinutes"],
  });

export const removeWorkBlockInput = z.object({ id: uuid });

export type CreateTaskInput = z.infer<typeof createTaskInput>;
export type UpdateTaskInput = z.infer<typeof updateTaskInput>;
export type SetTaskCompletionInput = z.infer<typeof setTaskCompletionInput>;
export type DeleteTaskInput = z.infer<typeof deleteTaskInput>;
export type ArchiveTaskInput = z.infer<typeof archiveTaskInput>;
export type ReorderTaskInput = z.infer<typeof reorderTaskInput>;
export type BulkCompleteInput = z.infer<typeof bulkCompleteInput>;
export type BulkMoveInput = z.infer<typeof bulkMoveInput>;
export type BulkDeleteInput = z.infer<typeof bulkDeleteInput>;
export type AddWorkBlockInput = z.infer<typeof addWorkBlockInput>;
export type UpdateWorkBlockInput = z.infer<typeof updateWorkBlockInput>;
export type RemoveWorkBlockInput = z.infer<typeof removeWorkBlockInput>;
