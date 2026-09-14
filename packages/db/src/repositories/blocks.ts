import { addDays } from "@momentum/core/time";
import {
  type Recurrence,
  PROJECT_COLORS,
  type BlockKind,
  type CalendarBlock,
  type EventBlock,
  type Instant,
  type LocalDate,
  type ProjectColor,
  type Uuid,
} from "@momentum/core/types";

import {
  rowToCalendarBlock,
  rowToEventBlock,
  serializeRecurrence,
} from "../mappers/calendar-block";
import { oneOf } from "../mappers/scalars";
import type { InsertRow, MomentumClient, UpdateRow } from "../types";

/**
 * Ownership is never re-checked here: row-level security is the authorization.
 * `completed_at` is a guarded column and appears in no insert or patch shape;
 * it moves only through `complete_block` / `uncomplete_block`.
 */

/**
 * `start`/`end` are the half-open UTC bounds `[start, end)`. `startDate`/`endDate`
 * are the first and last displayed local dates, needed because a series' `until`
 * and an override's `occurrence_date` are `date` columns, not instants.
 */
export interface BlockWindow {
  start: Instant;
  end: Instant;
  startDate: LocalDate;
  endDate: LocalDate;
}

/** `series` and `overrides` go straight to `expandAll(series, window, overrides)`. */
export interface BlockWindowRows {
  blocks: CalendarBlock[];
  series: EventBlock[];
  overrides: EventBlock[];
}

/**
 * Plain blocks, series rules and overrides for a window, in one round trip.
 *
 * The one-day margin on the series/override date predicates is load-bearing:
 * the window's bounds are instants in the user's timezone while a series' dates
 * resolve in the series' timezone, so the local date either side of the range
 * can still own an occurrence that reaches into it.
 */
export async function listWindow(
  client: MomentumClient,
  window: BlockWindow,
): Promise<BlockWindowRows> {
  const lead = addDays(window.startDate, -1);
  const trail = addDays(window.endDate, 1);

  // Values are quoted so PostgREST reads them as opaque strings: an instant
  // contains the `.` that separates a filter's parts.
  const { data, error } = await client
    .from("calendar_blocks")
    .select("*")
    .or(
      [
        `and(recurrence.is.null,series_id.is.null,` +
          `start_at.lt."${window.end}",end_at.gt."${window.start}")`,
        `and(recurrence.not.is.null,start_at.lt."${window.end}",` +
          `or(recurrence_until.is.null,recurrence_until.gte."${lead}"))`,
        `and(series_id.not.is.null,` +
          `occurrence_date.gte."${lead}",occurrence_date.lte."${trail}")`,
        // An override moved to another week has its `occurrence_date` outside
        // this window while its visible times are inside it; matching on the
        // times too is what keeps a moved occurrence findable.
        `and(series_id.not.is.null,` + `start_at.lt."${window.end}",end_at.gt."${window.start}")`,
      ].join(","),
    )
    .order("start_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw error;

  const rows: BlockWindowRows = { blocks: [], series: [], overrides: [] };
  for (const row of data) {
    if (row.recurrence !== null) rows.series.push(rowToEventBlock(row));
    else if (row.series_id !== null) rows.overrides.push(rowToEventBlock(row));
    else rows.blocks.push(rowToCalendarBlock(row));
  }
  return rows;
}

/** Blocks whose span was executed inside `[start, end)` — not tasks that finished. */
export async function listCompletedBetween(
  client: MomentumClient,
  userId: Uuid,
  window: { start: Instant; end: Instant },
): Promise<CalendarBlock[]> {
  const { data, error } = await client
    .from("calendar_blocks")
    .select("*")
    .eq("user_id", userId)
    .not("completed_at", "is", null)
    .gte("completed_at", window.start)
    .lt("completed_at", window.end)
    .order("completed_at", { ascending: false });

  if (error) throw error;
  return data.map(rowToCalendarBlock);
}

/** A row hidden by RLS is indistinguishable from a missing one, by design. */
export async function findById(client: MomentumClient, id: Uuid): Promise<CalendarBlock | null> {
  const { data, error } = await client
    .from("calendar_blocks")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data === null ? null : rowToCalendarBlock(data);
}

/** The override row for one occurrence, or null; `blocks_override_uniq` guarantees at most one. */
export async function findOverride(
  client: MomentumClient,
  seriesId: Uuid,
  occurrenceDate: LocalDate,
): Promise<EventBlock | null> {
  const { data, error } = await client
    .from("calendar_blocks")
    .select("*")
    .eq("series_id", seriesId)
    .eq("occurrence_date", occurrenceDate)
    .maybeSingle();

  if (error) throw error;
  return data === null ? null : rowToEventBlock(data);
}

/** Every work block for a set of tasks, oldest first, unbounded by any window. */
export async function listForTasks(
  client: MomentumClient,
  taskIds: readonly Uuid[],
): Promise<CalendarBlock[]> {
  if (taskIds.length === 0) return [];

  const { data, error } = await client
    .from("calendar_blocks")
    .select("*")
    .eq("kind", "work")
    .in("task_id", [...taskIds])
    .order("start_at", { ascending: true });

  if (error) throw error;
  return data.map(rowToCalendarBlock);
}

/**
 * Work blocks whose span *starts* inside `[start, end)`. The predicate is on
 * `start_at` alone because analytics counts a block on the date it starts.
 */
export async function listWorkBetween(
  client: MomentumClient,
  userId: Uuid,
  window: { start: Instant; end: Instant },
): Promise<CalendarBlock[]> {
  const { data, error } = await client
    .from("calendar_blocks")
    .select("*")
    .eq("user_id", userId)
    .eq("kind", "work")
    .gte("start_at", window.start)
    .lt("start_at", window.end)
    .order("start_at", { ascending: true });

  if (error) throw error;
  return data.map(rowToCalendarBlock);
}

export interface BlockCounts {
  /** Work blocks the task owns, across all weeks. */
  total: number;
  /** How many of them have no `completed_at`. */
  incomplete: number;
}

/**
 * Per-task work-block counts across all weeks — "does this block finish the
 * task?" is a question about every block, not the displayed week's.
 */
export async function blockCountsByTask(
  client: MomentumClient,
  taskIds: readonly Uuid[],
): Promise<Map<Uuid, BlockCounts>> {
  const counts = new Map<Uuid, BlockCounts>();
  if (taskIds.length === 0) return counts;

  const { data, error } = await client
    .from("calendar_blocks")
    .select("task_id, completed_at")
    .eq("kind", "work")
    .in("task_id", [...taskIds]);

  if (error) throw error;

  for (const row of data) {
    if (row.task_id === null) continue;
    const entry = counts.get(row.task_id) ?? { total: 0, incomplete: 0 };
    entry.total += 1;
    if (row.completed_at === null) entry.incomplete += 1;
    counts.set(row.task_id, entry);
  }
  return counts;
}

export interface HabitLabel {
  name: string;
  color: ProjectColor | null;
}

/** Name and colour of the habits behind a set of habit blocks, which carry no title of their own. */
export async function habitLabels(
  client: MomentumClient,
  habitIds: readonly Uuid[],
): Promise<Map<Uuid, HabitLabel>> {
  const labels = new Map<Uuid, HabitLabel>();
  if (habitIds.length === 0) return labels;

  const { data, error } = await client
    .from("habits")
    .select("id, name, color")
    .in("id", [...habitIds]);

  if (error) throw error;

  for (const row of data) {
    labels.set(row.id, {
      name: row.name,
      color:
        row.color === null ? null : oneOf<ProjectColor>(PROJECT_COLORS, row.color, "habits.color"),
    });
  }
  return labels;
}

/** Every habit block overlapping `[start, end)` for a set of habits, oldest first. */
export async function listForHabits(
  client: MomentumClient,
  habitIds: readonly Uuid[],
  window: { start: Instant; end: Instant },
): Promise<CalendarBlock[]> {
  if (habitIds.length === 0) return [];

  const { data, error } = await client
    .from("calendar_blocks")
    .select("*")
    .eq("kind", "habit")
    .in("habit_id", [...habitIds])
    .lt("start_at", window.end)
    .gt("end_at", window.start)
    .order("start_at", { ascending: true });

  if (error) throw error;
  return data.map(rowToCalendarBlock);
}

/**
 * A client-supplied `id` lets the optimistic row and the persisted row share a
 * key, and makes a retried insert collide with itself instead of duplicating.
 */
export interface NewBlock {
  id?: Uuid;
  userId: Uuid;
  kind: BlockKind;
  taskId?: Uuid | null;
  habitId?: Uuid | null;
  title?: string;
  description?: string | null;
  startAt: Instant;
  endAt: Instant;
  allDay?: boolean;
  color?: ProjectColor | null;
  seriesId?: Uuid | null;
  occurrenceDate?: LocalDate | null;
  cancelled?: boolean;
  /** Makes the row a series; `recurrence_until` is mirrored by trigger. Events only. */
  recurrence?: Recurrence | null;
}

/** The columns a client may change. `completed_at` is guarded and absent on purpose. */
export interface BlockPatch {
  title?: string;
  description?: string | null;
  startAt?: Instant;
  endAt?: Instant;
  allDay?: boolean;
  color?: ProjectColor | null;
  cancelled?: boolean;
  /** Null stops a series repeating; a rule on a non-series event starts one. */
  recurrence?: Recurrence | null;
}

export async function insert(client: MomentumClient, block: NewBlock): Promise<CalendarBlock> {
  const row: InsertRow<"calendar_blocks"> = {
    user_id: block.userId,
    kind: block.kind,
    start_at: block.startAt,
    end_at: block.endAt,
    ...(block.id === undefined ? {} : { id: block.id }),
    ...(block.taskId === undefined ? {} : { task_id: block.taskId }),
    ...(block.habitId === undefined ? {} : { habit_id: block.habitId }),
    ...(block.title === undefined ? {} : { title: block.title }),
    ...(block.description === undefined ? {} : { description: block.description }),
    ...(block.allDay === undefined ? {} : { all_day: block.allDay }),
    ...(block.color === undefined ? {} : { color: block.color }),
    ...(block.seriesId === undefined ? {} : { series_id: block.seriesId }),
    ...(block.occurrenceDate === undefined ? {} : { occurrence_date: block.occurrenceDate }),
    ...(block.cancelled === undefined ? {} : { cancelled: block.cancelled }),
    ...(block.recurrence === undefined || block.recurrence === null
      ? {}
      : { recurrence: serializeRecurrence(block.recurrence) }),
  };

  const { data, error } = await client.from("calendar_blocks").insert(row).select("*").single();

  if (error) throw error;
  return rowToCalendarBlock(data);
}

export async function update(
  client: MomentumClient,
  id: Uuid,
  patch: BlockPatch,
): Promise<CalendarBlock> {
  const row: UpdateRow<"calendar_blocks"> = {
    ...(patch.title === undefined ? {} : { title: patch.title }),
    ...(patch.description === undefined ? {} : { description: patch.description }),
    ...(patch.startAt === undefined ? {} : { start_at: patch.startAt }),
    ...(patch.endAt === undefined ? {} : { end_at: patch.endAt }),
    ...(patch.allDay === undefined ? {} : { all_day: patch.allDay }),
    ...(patch.color === undefined ? {} : { color: patch.color }),
    ...(patch.cancelled === undefined ? {} : { cancelled: patch.cancelled }),
    ...(patch.recurrence === undefined
      ? {}
      : { recurrence: patch.recurrence === null ? null : serializeRecurrence(patch.recurrence) }),
  };

  const { data, error } = await client
    .from("calendar_blocks")
    .update(row)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return rowToCalendarBlock(data);
}

/** Deletes a block. Never touches its task or habit. */
export async function remove(client: MomentumClient, id: Uuid): Promise<void> {
  const { error } = await client.from("calendar_blocks").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Records that a planned span was executed. Goes through the database function
 * because `completed_at` is guarded — a direct update is refused even for the owner.
 */
export async function complete(
  client: MomentumClient,
  blockId: Uuid,
  alsoCompleteTask = false,
): Promise<CalendarBlock> {
  const { data, error } = await client.rpc("complete_block", {
    p_block_id: blockId,
    p_also_complete_task: alsoCompleteTask,
  });

  if (error) throw error;
  return rowToCalendarBlock(data);
}

export async function uncomplete(
  client: MomentumClient,
  blockId: Uuid,
  alsoUncompleteTask = false,
): Promise<CalendarBlock> {
  const { data, error } = await client.rpc("uncomplete_block", {
    p_block_id: blockId,
    p_also_uncomplete_task: alsoUncompleteTask,
  });

  if (error) throw error;
  return rowToCalendarBlock(data);
}

/**
 * Completes a habit block and records the habit completion on the block's own
 * local date in one transaction; date and amount are resolved server-side.
 */
export async function completeHabit(client: MomentumClient, blockId: Uuid): Promise<CalendarBlock> {
  const { data, error } = await client.rpc("complete_habit_block", { p_block_id: blockId });

  if (error) throw error;
  return rowToCalendarBlock(data);
}

/** Removes the day's completion only when this block recorded it. XP is never withdrawn. */
export async function uncompleteHabit(
  client: MomentumClient,
  blockId: Uuid,
): Promise<CalendarBlock> {
  const { data, error } = await client.rpc("uncomplete_habit_block", { p_block_id: blockId });

  if (error) throw error;
  return rowToCalendarBlock(data);
}
