import { durationMinutes, nowInstant } from "@momentum/core/time";
import type {
  Instant,
  LocalDate,
  Minutes,
  Task,
  TaskPriority,
  TaskStatus,
  Uuid,
} from "@momentum/core/types";

import { toInstant } from "../mappers/scalars";
import { rowToTask } from "../mappers/task";
import type { InsertRow, MomentumClient, UpdateRow } from "../types";

/**
 * `tasks` has no scheduling columns by design: "is this scheduled?" is always a
 * query against `calendar_blocks`, never a column here.
 */

/**
 * How many top-level tasks the user has captured: every status, archived
 * included, because the question is "have they added tasks", not "are any left".
 * `open` narrows to unarchived open tasks, the count Today's empty state names.
 */
export async function countTopLevelFor(
  client: MomentumClient,
  userId: Uuid,
  filter: "all" | "open" = "all",
): Promise<number> {
  let query = client
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("parent_task_id", null);
  if (filter === "open") query = query.eq("status", "open").is("archived_at", null);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function listByIds(client: MomentumClient, ids: readonly Uuid[]): Promise<Task[]> {
  if (ids.length === 0) return [];

  const { data, error } = await client
    .from("tasks")
    .select("*")
    .in("id", [...ids]);

  if (error) throw error;
  return data.map(rowToTask);
}

/**
 * Open, unarchived tasks that own no work block, ordered priority → due date →
 * sort order. Two queries because PostgREST has no `not exists (select …)`.
 */
export async function listUnscheduledFor(client: MomentumClient, userId: Uuid): Promise<Task[]> {
  const { data: scheduled, error: scheduledError } = await client
    .from("calendar_blocks")
    .select("task_id")
    .eq("user_id", userId)
    .eq("kind", "work")
    .not("task_id", "is", null);

  if (scheduledError) throw scheduledError;

  const { data, error } = await client
    .from("tasks")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "open")
    .is("archived_at", null)
    .order("priority", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true });

  if (error) throw error;

  const hasBlock = new Set<string>();
  for (const row of scheduled) {
    if (row.task_id !== null) hasBlock.add(row.task_id);
  }

  return data.filter((row) => !hasBlock.has(row.id)).map(rowToTask);
}

/** Open tasks due inside `[from, to]` — both bounds inclusive, since `due_date` is a calendar date. */
export async function listDueBetween(
  client: MomentumClient,
  userId: Uuid,
  from: LocalDate,
  to: LocalDate,
): Promise<Task[]> {
  const { data, error } = await client
    .from("tasks")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "open")
    .is("archived_at", null)
    .gte("due_date", from)
    .lte("due_date", to)
    .order("due_date", { ascending: true })
    .order("priority", { ascending: true });

  if (error) throw error;
  return data.map(rowToTask);
}

/**
 * Open, unarchived, top-level tasks due strictly before `before` (today in the
 * profile timezone, resolved by the caller). Subtasks are excluded because they
 * are scheduled through their parent.
 */
export async function listOverdue(
  client: MomentumClient,
  userId: Uuid,
  before: LocalDate,
): Promise<Task[]> {
  const { data, error } = await client
    .from("tasks")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "open")
    .is("archived_at", null)
    .is("parent_task_id", null)
    .lt("due_date", before)
    .order("due_date", { ascending: true })
    .order("priority", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data.map(rowToTask);
}

/** Minutes reserved for each task across every week, not just the displayed range. */
export async function scheduledMinutesByTask(
  client: MomentumClient,
  taskIds: readonly Uuid[],
): Promise<Map<Uuid, Minutes>> {
  const minutes = new Map<Uuid, Minutes>();
  if (taskIds.length === 0) return minutes;

  const { data, error } = await client
    .from("calendar_blocks")
    .select("task_id, start_at, end_at")
    .eq("kind", "work")
    .in("task_id", [...taskIds]);

  if (error) throw error;

  for (const row of data) {
    if (row.task_id === null) continue;
    const span = durationMinutes(toInstant(row.start_at), toInstant(row.end_at));
    minutes.set(row.task_id, (minutes.get(row.task_id) ?? 0) + span);
  }
  return minutes;
}

/** Tasks completed inside `[start, end)`, newest first. */
export async function listCompletedBetween(
  client: MomentumClient,
  userId: Uuid,
  window: { start: Instant; end: Instant },
): Promise<Task[]> {
  const { data, error } = await client
    .from("tasks")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "completed")
    .gte("completed_at", window.start)
    .lt("completed_at", window.end)
    .order("completed_at", { ascending: false });

  if (error) throw error;
  return data.map(rowToTask);
}

/**
 * Every unarchived task, subtasks included; the manager's views are pure
 * predicates over this one list (`@momentum/core/tasks`).
 */
export async function listFor(client: MomentumClient, userId: Uuid): Promise<Task[]> {
  const { data, error } = await client
    .from("tasks")
    .select("*")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data.map(rowToTask);
}

/** What `listFor` leaves out, most recently archived first. Subtasks of an archived parent are not themselves archived. */
export async function listArchivedFor(client: MomentumClient, userId: Uuid): Promise<Task[]> {
  const { data, error } = await client
    .from("tasks")
    .select("*")
    .eq("user_id", userId)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false })
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data.map(rowToTask);
}

export async function findById(client: MomentumClient, id: Uuid): Promise<Task | null> {
  const { data, error } = await client.from("tasks").select("*").eq("id", id).maybeSingle();

  if (error) throw error;
  return data === null ? null : rowToTask(data);
}

/** Tasks owning at least one work block, across every week. */
export async function scheduledTaskIdsFor(
  client: MomentumClient,
  userId: Uuid,
): Promise<Set<Uuid>> {
  const { data, error } = await client
    .from("calendar_blocks")
    .select("task_id")
    .eq("user_id", userId)
    .eq("kind", "work")
    .not("task_id", "is", null);

  if (error) throw error;

  const ids = new Set<Uuid>();
  for (const row of data) {
    if (row.task_id !== null) ids.add(row.task_id);
  }
  return ids;
}

/**
 * No scheduling field, by design. A client-supplied `id` lets the optimistic and
 * persisted rows share a key and makes a retried insert collide with itself.
 */
export interface NewTask {
  id?: Uuid;
  userId: Uuid;
  title: string;
  description?: string | null;
  projectId?: Uuid | null;
  parentTaskId?: Uuid | null;
  priority?: TaskPriority;
  estimatedMinutes?: Minutes | null;
  /** A deadline, never a schedule. */
  dueDate?: LocalDate | null;
  sortOrder?: number;
}

/**
 * `status`, `completed_at` and `actual_minutes` are guarded columns and absent
 * on purpose; archiving has its own function.
 */
export interface TaskPatch {
  title?: string;
  description?: string | null;
  projectId?: Uuid | null;
  priority?: TaskPriority;
  estimatedMinutes?: Minutes | null;
  dueDate?: LocalDate | null;
  sortOrder?: number;
}

export async function insert(client: MomentumClient, task: NewTask): Promise<Task> {
  const row: InsertRow<"tasks"> = {
    user_id: task.userId,
    title: task.title,
    ...(task.id === undefined ? {} : { id: task.id }),
    ...(task.description === undefined ? {} : { description: task.description }),
    ...(task.projectId === undefined ? {} : { project_id: task.projectId }),
    ...(task.parentTaskId === undefined ? {} : { parent_task_id: task.parentTaskId }),
    ...(task.priority === undefined ? {} : { priority: task.priority }),
    ...(task.estimatedMinutes === undefined ? {} : { estimated_minutes: task.estimatedMinutes }),
    ...(task.dueDate === undefined ? {} : { due_date: task.dueDate }),
    ...(task.sortOrder === undefined ? {} : { sort_order: task.sortOrder }),
  };

  const { data, error } = await client.from("tasks").insert(row).select("*").single();

  if (error) throw error;
  return rowToTask(data);
}

export async function update(client: MomentumClient, id: Uuid, patch: TaskPatch): Promise<Task> {
  const { data, error } = await client
    .from("tasks")
    .update(patchRow(patch))
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return rowToTask(data);
}

/** One statement, so a bulk action cannot half-apply. RLS scopes it to the caller's rows. */
export async function updateMany(
  client: MomentumClient,
  ids: readonly Uuid[],
  patch: TaskPatch,
): Promise<Task[]> {
  if (ids.length === 0) return [];

  const { data, error } = await client
    .from("tasks")
    .update(patchRow(patch))
    .in("id", [...ids])
    .select("*");

  if (error) throw error;
  return data.map(rowToTask);
}

function patchRow(patch: TaskPatch): UpdateRow<"tasks"> {
  return {
    ...(patch.title === undefined ? {} : { title: patch.title }),
    ...(patch.description === undefined ? {} : { description: patch.description }),
    ...(patch.projectId === undefined ? {} : { project_id: patch.projectId }),
    ...(patch.priority === undefined ? {} : { priority: patch.priority }),
    ...(patch.estimatedMinutes === undefined ? {} : { estimated_minutes: patch.estimatedMinutes }),
    ...(patch.dueDate === undefined ? {} : { due_date: patch.dueDate }),
    ...(patch.sortOrder === undefined ? {} : { sort_order: patch.sortOrder }),
  };
}

/** Deletes a task; `on delete cascade` removes its subtasks and work blocks. */
export async function remove(client: MomentumClient, id: Uuid): Promise<void> {
  const { error } = await client.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

export async function removeMany(client: MomentumClient, ids: readonly Uuid[]): Promise<void> {
  if (ids.length === 0) return;

  const { error } = await client
    .from("tasks")
    .delete()
    .in("id", [...ids]);
  if (error) throw error;
}

/**
 * `open` ↔ `archived` is the one status transition `guard_tasks()` lets a client
 * make. Both columns move together: `tasks_status_archived_chk` requires a
 * timestamp on an archived row.
 */
export async function setArchived(
  client: MomentumClient,
  id: Uuid,
  archived: boolean,
): Promise<Task> {
  const status: TaskStatus = archived ? "archived" : "open";
  const { data, error } = await client
    .from("tasks")
    .update({ status, archived_at: archived ? nowInstant() : null })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return rowToTask(data);
}

/**
 * Completes a task and leaves its blocks alone. Goes through the database
 * function because the completion columns are guarded.
 */
export async function complete(client: MomentumClient, taskId: Uuid): Promise<Task> {
  const { data, error } = await client.rpc("complete_task", { p_task_id: taskId });

  if (error) throw error;
  return rowToTask(data);
}

/** Reopens a task. Its incomplete blocks were never touched, so nothing is restored. */
export async function uncomplete(client: MomentumClient, taskId: Uuid): Promise<Task> {
  const { data, error } = await client.rpc("uncomplete_task", { p_task_id: taskId });

  if (error) throw error;
  return rowToTask(data);
}
