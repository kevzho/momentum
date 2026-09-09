import { z } from "zod";

import { isLocalDate, localDate } from "@momentum/core/time";
import { TASK_PRIORITIES } from "@momentum/core/types";

/**
 * What the task manager's server actions accept.
 *
 * The shape follows the calendar's (`features/calendar/schemas.ts`): ids are
 * client-generated so a retry collides with itself (Domain Rule 17), and any
 * span arrives as wall clock for the server to convert with the profile
 * timezone (Domain Rule 4).
 *
 * The one thing to notice is what is **not** here. There is no `scheduledAt` on
 * a task, and no way to give a task a time. A task's time is a work block, and
 * a work block is created by `addWorkBlock` with its own id — which is what
 * makes "0..n blocks per task" true of the API and not only of the schema
 * (Domain Rule 2). `dueDate` is a deadline and is on the task; the two are
 * different fields of different shapes in different actions on purpose
 * (Domain Rule 1).
 */

const uuid = z.uuid("That is not a valid id.");

const localDateField = z
  .string()
  .refine(isLocalDate, "Dates are YYYY-MM-DD.")
  .transform((value) => localDate(value));

/**
 * 500 characters is the database's own bound (`tasks_title_chk`), checked here
 * too so an over-long paste comes back as a message on the field rather than as
 * a constraint violation the UI has to translate.
 */
const title = z
  .string()
  .trim()
  .min(1, "Give the task a title.")
  .max(500, "Titles are at most 500 characters.");

const description = z.string().trim().max(5000, "Notes are at most 5000 characters.").nullable();

const priority = z
  .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
  .describe(`One of ${TASK_PRIORITIES.join(", ")}; 4 means "no priority set".`);

/** Mirrors `tasks_estimate_chk`: positive, and at most a week of minutes. */
const estimatedMinutes = z
  .number()
  .int("Estimates are whole minutes.")
  .positive("An estimate has to be more than zero.")
  .max(10080, "An estimate is at most one week.")
  .nullable();

/* -------------------------------------------------------------------------- */
/* Tasks                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Quick Add's minimum is a title. Everything else is optional here because
 * everything else is optional there — the spec's "type a title, press Enter" is
 * a property of this schema before it is a property of the input.
 *
 * `parentTaskId` makes the same action create a subtask, so there is one create
 * path and one set of validation rules rather than two that drift.
 */
export const createTaskInput = z.object({
  id: uuid,
  title,
  description: description.default(null),
  projectId: uuid.nullable().default(null),
  parentTaskId: uuid.nullable().default(null),
  priority: priority.default(4),
  estimatedMinutes: estimatedMinutes.default(null),
  dueDate: localDateField.nullable().default(null),
  /** Where in the manual order the new row goes; the list computes it. */
  sortOrder: z.number().finite().default(0),
});

/**
 * Every editable field of a task, in one action.
 *
 * A partial patch rather than a field-per-action: the detail sheet saves what
 * changed, and a sheet that made six round trips to save six fields would be
 * six chances to half-save. `status`, `completedAt` and `actualMinutes` are
 * absent because they are guarded columns and move only through the trusted
 * functions (Domain Rule 15).
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
 * A manual reorder, as the rows it has to write.
 *
 * Usually one: `sortOrdersForMove` places the moved row at the midpoint of its
 * two new neighbours. When those neighbours hold the same number — the state of
 * every list nobody has reordered, since rows are created at `0` — no single
 * number can land between them, so the tied run is spread and every row whose
 * number changes is in the batch. Bounded at 200 to match the bulk actions.
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

/* -------------------------------------------------------------------------- */
/* Bulk actions                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Bounded, because a bulk action is a selection a person made in a list and
 * 200 is far past the point where they would rather filter. An unbounded id
 * list is also an unbounded statement.
 */
const ids = z
  .array(uuid)
  .min(1, "Select at least one task.")
  .max(200, "That is more tasks than one action should change at once.");

export const bulkCompleteInput = z.object({ ids, completed: z.boolean() });
export const bulkMoveInput = z.object({ ids, projectId: uuid.nullable() });
export const bulkDeleteInput = z.object({ ids });

/* -------------------------------------------------------------------------- */
/* Work blocks                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Reserved time for a task, from the detail sheet.
 *
 * The same wall-clock span the calendar's actions take — `{ date, startMinutes,
 * endMinutes }`, converted server-side with the profile timezone — because it
 * is the same write to the same table, reached from a different surface. The
 * sheet and a drag onto the grid produce identical rows.
 *
 * `endMinutes` may exceed 1440: a block from 23:30 to 00:30 ends 1470 minutes
 * after its own day's midnight, which is how `queries.ts` reports it.
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
