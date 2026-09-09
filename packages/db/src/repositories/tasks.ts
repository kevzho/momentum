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
 * `tasks` — the reads the calendar needs, and the two trusted transitions.
 *
 * The table has no scheduling columns by design (Domain Rule 2): when a task is
 * worked on is expressed by the work blocks that point at it, which is why
 * every "is this scheduled?" question below is answered by a second query
 * against `calendar_blocks` rather than by a column here.
 */

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

/** The tasks behind a set of work blocks, for the context the grid renders on them. */
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
 * The Plan panel's UNSCHEDULED section: open, unarchived tasks that own no work
 * block at all (specs/03-weekly-calendar.md).
 *
 * Two queries, not one. PostgREST has no `not exists (select …)` — a filter can
 * only name columns of the table being queried — so the alternative to reading
 * the scheduled ids and differencing the sets in memory is a database view or
 * an RPC, both of which would be new schema for a set difference over a list
 * the size of one person's open tasks. `blocks_task_idx` makes the first query
 * an index-only scan.
 *
 * `status = 'open'` already excludes the archived, whose status is `archived`;
 * the `archived_at is null` filter is the second half of the same statement and
 * costs nothing, so a row that somehow disagreed with itself is still excluded.
 *
 * Ordering is priority first, then the nearest deadline, then the user's own
 * manual order — so the top of the panel is the part worth scheduling even when
 * the list is long.
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

/**
 * The Plan panel's UPCOMING section: open tasks due inside the displayed range,
 * whether or not they already have blocks.
 *
 * Both bounds are inclusive, because `due_date` is a calendar date and "due
 * Sunday" belongs to a week that ends on Sunday (Domain Rule 1 — a deadline is
 * not a span, so the half-open rule that governs instants does not apply).
 */
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
 * The planning drawer's OVERDUE section: open, unarchived, top-level tasks
 * whose deadline has passed (specs/05-week-planning.md).
 *
 * `before` is "today" in the profile timezone, resolved once by the caller
 * and passed in; a `due_date` is a calendar date, so "overdue" is a date
 * comparison and never an instant one (Domain Rule 4). Strict: a task due
 * today is today's, not overdue.
 *
 * Subtasks are excluded at the database rather than by the caller, because
 * the section lists work a person schedules and a subtask is scheduled
 * through its parent (`@momentum/core/tasks` `matchesView` applies the same
 * rule to every list view). Ordered by the deadline first — the section
 * exists to show what is most past due — then priority, then the user's own
 * order, so the top of it is the row most worth placing. `tasks_user_status_due_idx`
 * covers the filter and the leading sort key.
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

/**
 * Minutes already reserved for each task, across every week.
 *
 * Coverage is "how much of the estimate is on the calendar", so it is summed
 * over all of a task's work blocks and not over the displayed range: a task
 * fully scheduled for next week is scheduled, and showing it as unplanned
 * because this week is empty would be wrong.
 *
 * Summed with `durationMinutes` rather than in SQL because a block's length is
 * elapsed time between two instants, and elapsed time is exactly what the time
 * module owns (Domain Rule 5).
 */
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

/**
 * Every task the manager's six views are computed from, in one read.
 *
 * One query, not six. The views are filters over the same data
 * (specs/04-task-manager.md), and they are pure predicates in
 * `@momentum/core/tasks` — so shipping six `.eq()` chains here would be six
 * places for "what counts as Today" to drift from the definition the tests
 * cover. A single person's task list is small enough that the round trip, not
 * the row count, is the cost worth minimising.
 *
 * Subtasks come back in the same result. They are excluded from every view by
 * `matchesView`, and the detail sheet needs them for whichever parent it opens;
 * fetching them here means opening a task is not a second request.
 *
 * Archived tasks are excluded at the database, because nothing in the product
 * displays them yet and reading them would only be to throw them away.
 */
/**
 * Tasks completed inside a window of instants.
 *
 * `completed_at` is a timestamp; which local day it belongs to is a question
 * for `@momentum/core/time`, answered in the profile timezone by the caller
 * (Domain Rule 4). Quests and weekly goals count these rows, and they count
 * them again on every read rather than storing a running total, so that
 * un-completing something lowers the count instead of leaving a stale number.
 */
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

export async function findById(client: MomentumClient, id: Uuid): Promise<Task | null> {
  const { data, error } = await client.from("tasks").select("*").eq("id", id).maybeSingle();

  if (error) throw error;
  return data === null ? null : rowToTask(data);
}

/**
 * The set of tasks that own at least one work block.
 *
 * This is the *only* correct way to ask "is this task scheduled?" (Domain Rule
 * 2): the answer lives in `calendar_blocks`, keyed by `task_id`, and a task
 * with three blocks and a task with one are both simply "scheduled". There is
 * no column on `tasks` that could answer it, by design.
 *
 * Unbounded by any window, because a task fully booked for next week is
 * scheduled — showing it as unplanned because this week happens to be empty
 * would be wrong.
 */
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

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A new task.
 *
 * There is deliberately no scheduling field here and there never will be
 * (Domain Rule 2). Creating a task and reserving time for it are two writes to
 * two tables, because they are two different decisions the user makes at
 * different times — often days apart, and often more than once for the same
 * task.
 *
 * `id` is supplied by the client so the optimistic row and the persisted row
 * share a key and a retried insert collides with itself (Domain Rule 17).
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
  /** A deadline, never a schedule (Domain Rule 1). */
  dueDate?: LocalDate | null;
  sortOrder?: number;
}

/**
 * The columns a client may change.
 *
 * `status`, `completed_at` and `actual_minutes` are absent on purpose: they are
 * guarded and move only through the trusted functions below (Domain Rule 15).
 * Archiving is the one status change a client may make and has its own function,
 * so that this patch cannot be the route to an inconsistent completion state.
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

/**
 * The same patch applied to several tasks: the bulk bar's "move to project".
 *
 * One statement rather than a loop, so a bulk action is one round trip and
 * cannot half-apply. RLS still scopes it to the caller's own rows — a crafted
 * id list simply matches nothing (Domain Rule 9).
 */
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

/**
 * Deletes a task, and with it — by `on delete cascade` — its subtasks and every
 * work block that pointed at it.
 *
 * That cascade is Domain Rule 13's "blocks have no meaning without their
 * parent", enforced by the schema rather than by a delete loop here. Deleting a
 * *block* never touches the task; the asymmetry is deliberate and runs one way.
 */
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
 * Archiving: "not now", without destroying anything.
 *
 * `open` ↔ `archived` is the one status transition `guard_tasks()` lets a client
 * make, precisely so this can be an ordinary update while completion cannot
 * (`20260906120300_tasks.sql`). Both columns move together, because
 * `tasks_status_archived_chk` requires a timestamp on an archived row.
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

/* -------------------------------------------------------------------------- */
/* Trusted writes                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Completes a task and leaves its blocks alone (Domain Rule 13).
 *
 * `status`, `completed_at` and `actual_minutes` are guarded columns, so this
 * goes through the database function; a direct update is refused even for the
 * row's own owner (Domain Rule 15). Phase 3 reaches it only through
 * `complete_block(..., true)`; Phase 4 adds the task manager's own callers.
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
