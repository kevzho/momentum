"use server";

import { refresh, revalidatePath } from "next/cache";

import { blocks, tasks } from "@momentum/db";
import { addMinutes, fromLocal } from "@momentum/core/time";
import type {
  CalendarBlock,
  IanaTimeZone,
  Instant,
  LocalDate,
  Minutes,
  Task,
  Uuid,
} from "@momentum/core/types";

import {
  addWorkBlockInput,
  archiveTaskInput,
  bulkCompleteInput,
  bulkDeleteInput,
  bulkMoveInput,
  createTaskInput,
  deleteTaskInput,
  removeWorkBlockInput,
  reorderTaskInput,
  setTaskCompletionInput,
  updateTaskInput,
  updateWorkBlockInput,
} from "@/features/tasks/schemas";
import {
  failure,
  success,
  validationError,
  type ActionErrorCode,
  type ActionResult,
} from "@/lib/actions/result";
import { requireSession } from "@/lib/auth/session";

/**
 * Every mutation the task manager can make.
 *
 * Same shape as the calendar's (docs/ARCHITECTURE.md §6): validate with zod,
 * take the session, call a repository, revalidate, return an `ActionResult`.
 * Nothing throws for a failure a user can cause.
 *
 * Two things are specific to this feature.
 *
 * **Completion is an RPC, never an update.** `status`, `completed_at` and
 * `actual_minutes` are guarded columns; the browser holds its own JWT and could
 * otherwise write them straight to PostgREST (Domain Rule 15). Completing a
 * task also never touches its blocks (Domain Rule 13) — incomplete future
 * blocks of a completed task stay on the calendar.
 *
 * **Work blocks are separate writes to a separate table.** There is no action
 * here that sets "when a task is scheduled", because that is not a property a
 * task has. `addWorkBlock` creates one of 0..n rows pointing at the task, and
 * calling it twice gives the task two blocks — which is the entire point of
 * Domain Rule 2.
 */

/* -------------------------------------------------------------------------- */
/* Tasks                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Quick Add's write, and the subtask form's, and the detail sheet's.
 *
 * The id comes from the client, so the optimistic row already on screen and the
 * persisted row share a key and a retry after a lost response collides with
 * itself instead of creating a twin (Domain Rule 17).
 */
export async function createTask(input: unknown): Promise<ActionResult<Task>> {
  const parsed = createTaskInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, ...fields } = parsed.data;
  const { supabase, userId } = await requireSession();

  return attempt(async () => {
    try {
      return await tasks.insert(supabase, { id, userId, ...fields });
    } catch (error) {
      if (!isCode(error, UNIQUE_VIOLATION)) throw error;
      const existing = await tasks.findById(supabase, id);
      if (existing === null) throw error;
      return existing;
    }
  });
}

/** Every editable field, in one write, so a save cannot half-apply. */
export async function updateTask(input: unknown): Promise<ActionResult<Task>> {
  const parsed = updateTaskInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, ...patch } = parsed.data;
  const { supabase } = await requireSession();

  return attempt(() => tasks.update(supabase, id, patch));
}

/**
 * The checkbox, from the list or the sheet.
 *
 * Completing a task from anywhere other than a block completes the task and
 * leaves its blocks untouched (Domain Rule 13). Un-completing restores it with
 * those blocks exactly as they were; nothing is deleted in either direction,
 * and no XP is withdrawn (Domain Rule 7).
 */
export async function setTaskCompletion(input: unknown): Promise<ActionResult<Task>> {
  const parsed = setTaskCompletionInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, completed } = parsed.data;
  const { supabase } = await requireSession();

  return attempt(() => (completed ? tasks.complete(supabase, id) : tasks.uncomplete(supabase, id)));
}

/** Deletes the task, and by cascade its subtasks and every block that pointed at it. */
export async function deleteTask(input: unknown): Promise<ActionResult<{ id: Uuid }>> {
  const parsed = deleteTaskInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id } = parsed.data;
  const { supabase } = await requireSession();

  return attempt(async () => {
    await tasks.remove(supabase, id);
    return { id };
  });
}

/** "Not now", without destroying anything. The one status change a client may make. */
export async function archiveTask(input: unknown): Promise<ActionResult<Task>> {
  const parsed = archiveTaskInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, archived } = parsed.data;
  const { supabase } = await requireSession();

  return attempt(() => tasks.setArchived(supabase, id, archived));
}

/**
 * A reorder: every row whose place changed, written under the user's RLS.
 *
 * Each entry carries its own number, so this is one update per row rather than
 * `updateMany`'s single patch. They are issued together, and a refusal on any
 * of them is reported as one failure — `refresh()` then re-renders the list
 * from whatever did commit, so the screen never shows an order the database
 * does not hold (Domain Rule 11).
 */
export async function reorderTask(input: unknown): Promise<ActionResult<Task[]>> {
  const parsed = reorderTaskInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { orders } = parsed.data;
  const { supabase } = await requireSession();

  return attempt(() =>
    Promise.all(orders.map(({ id, sortOrder }) => tasks.update(supabase, id, { sortOrder }))),
  );
}

/* -------------------------------------------------------------------------- */
/* Bulk actions                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Completing a selection.
 *
 * A loop of RPCs rather than one statement, because completion is guarded and
 * `complete_task` is the only door to it — and each call is idempotent, so a
 * retry of the whole action after a partial failure settles on the same state
 * (Domain Rule 6).
 *
 * They are issued together and settled **individually**, which is the part that
 * cannot go through `attempt`. Each RPC is its own transaction, so one refusal
 * — a row another tab has since deleted — does not undo the siblings that
 * committed. Reporting that as a plain failure and revalidating nothing would
 * leave the list rendering rows as open that Postgres has already completed,
 * the silent divergence Domain Rule 11 forbids. So whatever committed is
 * revalidated first, and the first rejection is then reported on top of it.
 */
export async function bulkSetCompletion(input: unknown): Promise<ActionResult<Task[]>> {
  const parsed = bulkCompleteInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { ids, completed } = parsed.data;
  const { supabase } = await requireSession();

  const settled = await Promise.allSettled(
    ids.map((id) => (completed ? tasks.complete(supabase, id) : tasks.uncomplete(supabase, id))),
  );

  const done: Task[] = [];
  const rejections: unknown[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") done.push(result.value);
    else rejections.push(result.reason);
  }

  if (done.length > 0) revalidateTaskSurfaces();

  if (rejections.length > 0) {
    const mapped = describe(rejections[0]);
    return failure(mapped.code, mapped.message);
  }

  return success(done);
}

/** Filing a selection. One statement; RLS scopes it to the caller's own rows. */
export async function bulkMoveToProject(input: unknown): Promise<ActionResult<Task[]>> {
  const parsed = bulkMoveInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { ids, projectId } = parsed.data;
  const { supabase } = await requireSession();

  return attempt(() => tasks.updateMany(supabase, ids, { projectId }));
}

export async function bulkDeleteTasks(input: unknown): Promise<ActionResult<{ ids: Uuid[] }>> {
  const parsed = bulkDeleteInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { ids } = parsed.data;
  const { supabase } = await requireSession();

  return attempt(async () => {
    await tasks.removeMany(supabase, ids);
    return { ids };
  });
}

/* -------------------------------------------------------------------------- */
/* Work blocks                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Reserves time for a task — one of however many the task ends up with.
 *
 * This is the same row a drag from the Plan panel onto the grid creates, and it
 * is written the same way: a `calendar_blocks` row with `kind = 'work'` and the
 * task's id. The block carries no title of its own — it renders its task's — and
 * nothing here touches `due_date` (Domain Rule 1).
 */
export async function addWorkBlock(input: unknown): Promise<ActionResult<CalendarBlock>> {
  const parsed = addWorkBlockInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, taskId, date, startMinutes, endMinutes } = parsed.data;
  const { supabase, userId, profile } = await requireSession();
  const span = spanInstants(date, startMinutes, endMinutes, profile.timezone);

  return attempt(async () => {
    try {
      return await blocks.insert(supabase, { id, userId, kind: "work", taskId, ...span });
    } catch (error) {
      if (!isCode(error, UNIQUE_VIOLATION)) throw error;
      const existing = await blocks.findById(supabase, id);
      if (existing === null) throw error;
      return existing;
    }
  });
}

/** Moving or resizing one of a task's blocks from the sheet. */
export async function updateWorkBlock(input: unknown): Promise<ActionResult<CalendarBlock>> {
  const parsed = updateWorkBlockInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, date, startMinutes, endMinutes } = parsed.data;
  const { supabase, profile } = await requireSession();

  return attempt(() =>
    blocks.update(supabase, id, spanInstants(date, startMinutes, endMinutes, profile.timezone)),
  );
}

/**
 * Giving back a reserved span. The task is untouched (Domain Rule 13):
 * abandoning a plan for some time is not abandoning the work.
 */
export async function removeWorkBlock(input: unknown): Promise<ActionResult<{ id: Uuid }>> {
  const parsed = removeWorkBlockInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id } = parsed.data;
  const { supabase } = await requireSession();

  return attempt(async () => {
    await blocks.remove(supabase, id);
    return { id };
  });
}

/* -------------------------------------------------------------------------- */
/* Wall clock → instants                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The same conversion the calendar's actions make, and for the same reason: the
 * client is not allowed to assert an instant, because the profile timezone is
 * the server's to apply (Domain Rule 4).
 *
 * The fallback handles the one span `fromLocal` cannot resolve in order — a
 * span straddling the far edge of a spring-forward gap, where both ends move
 * but the end moves further. There the drawn *length* is the only meaning left,
 * which is also how `spanInstants` in `features/calendar/actions.ts` and
 * `expandSeries` resolve it.
 */
function spanInstants(
  date: LocalDate,
  startMinutes: Minutes,
  endMinutes: Minutes,
  timezone: IanaTimeZone,
): { startAt: Instant; endAt: Instant } {
  const startAt = fromLocal(date, startMinutes, timezone);
  const endAt = fromLocal(date, endMinutes, timezone);
  return endAt > startAt
    ? { startAt, endAt }
    : { startAt, endAt: addMinutes(startAt, endMinutes - startMinutes) };
}

/* -------------------------------------------------------------------------- */
/* Failure                                                                    */
/* -------------------------------------------------------------------------- */

const UNIQUE_VIOLATION = "23505";

interface DatabaseError {
  code: string;
  message: string;
}

function isDatabaseError(value: unknown): value is DatabaseError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof (value as { code: unknown }).code === "string" &&
    "message" in value &&
    typeof (value as { message: unknown }).message === "string"
  );
}

function isCode(error: unknown, code: string): boolean {
  return isDatabaseError(error) && error.code === code;
}

/**
 * The reads a task mutation invalidates.
 *
 * `refresh()` re-renders the current route with server truth, which is what
 * replaces the optimistic state the client applied. `/calendar` is revalidated
 * too, and not as a precaution: a work block created from the detail sheet is a
 * row the week grid renders, and completing a task changes how its blocks are
 * drawn there. One surface's mutation genuinely invalidates the other's read
 * (docs/ARCHITECTURE.md §6), and a calendar left showing a block the user just
 * deleted from the sheet is the silent divergence Domain Rule 11 forbids.
 *
 * Its own function because `bulkSetCompletion` needs it outside a success —
 * a partial commit still has to reach the client — and the two surfaces must
 * not drift.
 */
function revalidateTaskSurfaces(): void {
  refresh();
  revalidatePath("/calendar");
  revalidatePath("/today");
}

/** Runs a mutation and turns anything it throws into an `ActionResult`. */
async function attempt<T>(operation: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await operation();
    revalidateTaskSurfaces();
    return success(data);
  } catch (error) {
    const mapped = describe(error);
    return failure(mapped.code, mapped.message);
  }
}

/**
 * Messages for the constraints a task interaction can actually trip. Anything
 * unlisted falls back to the database's own message, which is still more useful
 * than a generic apology.
 */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  tasks_title_chk: "A task needs a title, and it can be at most 500 characters.",
  tasks_priority_chk: "Priority is P1 to P4.",
  tasks_estimate_chk: "An estimate has to be more than zero and at most one week.",
  tasks_status_completed_chk: "That task's status and completion time disagree.",
  tasks_status_archived_chk: "An archived task needs the time it was archived.",
  tasks_no_self_parent_chk: "A task cannot be its own subtask.",
  blocks_span_chk: "A block has to end after it starts, and can be at most seven days long.",
  blocks_kind_shape_chk: "A work block needs a task.",
};

/**
 * Maps a thrown value onto the six codes the UI branches on. The codes are
 * Postgres SQLSTATEs, which PostgREST passes through verbatim.
 */
function describe(error: unknown): { code: ActionErrorCode; message: string } {
  if (!isDatabaseError(error)) {
    return { code: "unavailable", message: "Something went wrong. Please try again." };
  }

  switch (error.code) {
    case "42501":
      return { code: "forbidden", message: "That task belongs to another account." };
    case "P0002":
    case "PGRST116":
      return { code: "not_found", message: "That task no longer exists." };
    case "23514": {
      const named = Object.keys(CONSTRAINT_MESSAGES).find((name) => error.message.includes(name));
      return {
        code: "validation",
        message: named ? (CONSTRAINT_MESSAGES[named] as string) : error.message,
      };
    }
    case "22023":
      return { code: "validation", message: error.message };
    case "23503":
      return { code: "not_found", message: "That project or task no longer exists." };
    case "23505":
      return { code: "conflict", message: "That task already exists." };
    default:
      // Every other unlisted SQLSTATE — an expired token (PGRST301), a statement
      // timeout (57014), an internal code — carries the database's own wording,
      // which is not the user's to read. Match the fixed fallback the other
      // action modules use rather than forwarding it (docs/ARCHITECTURE.md §6).
      return {
        code: "unavailable",
        message: "Momentum could not save that change. Please try again.",
      };
  }
}
