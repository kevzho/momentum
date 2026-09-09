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

// Completion is an RPC, never an update: `status`, `completed_at` and
// `actual_minutes` are guarded columns. Work blocks are separate rows in a
// separate table; a task has no "scheduled at".

/** The id comes from the client, so a retry after a lost response collides with itself. */
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

export async function updateTask(input: unknown): Promise<ActionResult<Task>> {
  const parsed = updateTaskInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, ...patch } = parsed.data;
  const { supabase } = await requireSession();

  return attempt(() => tasks.update(supabase, id, patch));
}

/** Leaves the task's blocks untouched in either direction; no XP is withdrawn. */
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

/** The one status change a client may make directly. */
export async function archiveTask(input: unknown): Promise<ActionResult<Task>> {
  const parsed = archiveTaskInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, archived } = parsed.data;
  const { supabase } = await requireSession();

  return attempt(() => tasks.setArchived(supabase, id, archived));
}

/** One update per row (each carries its own number); a refusal on any is one failure. */
export async function reorderTask(input: unknown): Promise<ActionResult<Task[]>> {
  const parsed = reorderTaskInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { orders } = parsed.data;
  const { supabase } = await requireSession();

  return attempt(() =>
    Promise.all(orders.map(({ id, sortOrder }) => tasks.update(supabase, id, { sortOrder }))),
  );
}

/**
 * A loop of `complete_task` RPCs, since completion is guarded. Each is its own
 * transaction, so on a partial failure whatever committed is revalidated first
 * and the first rejection is reported on top; this cannot go through `attempt`.
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

/** The same `calendar_blocks` row a drag from the Plan panel creates. Never touches `due_date`. */
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

export async function updateWorkBlock(input: unknown): Promise<ActionResult<CalendarBlock>> {
  const parsed = updateWorkBlockInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, date, startMinutes, endMinutes } = parsed.data;
  const { supabase, profile } = await requireSession();

  return attempt(() =>
    blocks.update(supabase, id, spanInstants(date, startMinutes, endMinutes, profile.timezone)),
  );
}

/** The task is untouched. */
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

// Must match `spanInstants` in `features/calendar/actions.ts`. The fallback
// handles a span on the far edge of a spring-forward gap, which `fromLocal`
// resolves out of order; there the drawn length is the only meaning left.
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

// `/calendar` and `/today` render work blocks and completion state too, so a
// task mutation invalidates their reads as well as the current route's.
function revalidateTaskSurfaces(): void {
  refresh();
  revalidatePath("/calendar");
  revalidatePath("/today");
}

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

// The codes are Postgres SQLSTATEs, which PostgREST passes through verbatim.
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
      // Any other code carries the database's own wording, which is not the
      // user's to read.
      return {
        code: "unavailable",
        message: "Momentum could not save that change. Please try again.",
      };
  }
}
