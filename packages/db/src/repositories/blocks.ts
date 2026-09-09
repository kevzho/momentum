import { addDays } from "@momentum/core/time";
import {
  PROJECT_COLORS,
  type BlockKind,
  type CalendarBlock,
  type EventBlock,
  type Instant,
  type LocalDate,
  type ProjectColor,
  type Uuid,
} from "@momentum/core/types";

import { rowToCalendarBlock, rowToEventBlock } from "../mappers/calendar-block";
import { oneOf } from "../mappers/scalars";
import type { InsertRow, MomentumClient, UpdateRow } from "../types";

/**
 * `calendar_blocks` — the one table every time-bound thing lives in.
 *
 * Plain functions over a user-scoped client, returning domain types. Ownership
 * is never re-checked here: row-level security is the authorization, and a
 * second permission model in TypeScript is only somewhere for the two to
 * disagree (docs/ARCHITECTURE.md §4).
 *
 * `completed_at` appears in no insert or patch shape below. It is a guarded
 * column: the only way to move it is `complete_block` / `uncomplete_block`,
 * which is what `complete()` and `uncomplete()` call (Domain Rule 15).
 */

/* -------------------------------------------------------------------------- */
/* The window query                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The range a week or a day is asked for.
 *
 * `start`/`end` are the half-open UTC bounds `[start, end)` that `weekRange`
 * produces — half-open because a block ending exactly at midnight belongs to
 * the earlier day and must not be counted twice by the next day's query.
 * `startDate`/`endDate` are the first and last displayed local dates, which the
 * recurrence predicates need because a series' `until` and an override's
 * `occurrence_date` are `date` columns, not instants.
 */
export interface BlockWindow {
  start: Instant;
  end: Instant;
  startDate: LocalDate;
  endDate: LocalDate;
}

/**
 * The three kinds of row a window contains, kept apart.
 *
 * They are returned separately rather than as one list because they mean three
 * different things: `blocks` belong on the grid as themselves, `series` are
 * rules that produce occurrences, and `overrides` are the edits applied to
 * those occurrences. `expandAll(series, window, overrides)` takes the last two
 * exactly as they come back — `expandSeries` filters overrides by their series
 * itself, so there is nothing to partition first.
 */
export interface BlockWindowRows {
  blocks: CalendarBlock[];
  series: EventBlock[];
  overrides: EventBlock[];
}

/**
 * Everything the displayed range needs, in one round trip.
 *
 * The three predicates are fixed by docs/ARCHITECTURE.md §11 and are disjoint —
 * `blocks_recurrence_kind_chk` makes a series row one with `recurrence` and no
 * `series_id`, so no row can be counted as two things:
 *
 *   plain     recurrence is null and series_id is null
 *             and start_at < :end and end_at > :start
 *   series    recurrence is not null and start_at < :end
 *             and (recurrence_until is null or recurrence_until >= :startDate - 1)
 *   override  series_id is not null
 *             and occurrence_date between :startDate - 1 and :endDate + 1
 *
 * The one-day margin on both sides is not slack. The window's bounds are
 * instants chosen in the *user's* timezone while a series' dates are resolved
 * in the *series'* timezone (Domain Rule 16), so the local date either side of
 * the range can still own an occurrence that reaches into it.
 */
export async function listWindow(
  client: MomentumClient,
  window: BlockWindow,
): Promise<BlockWindowRows> {
  const lead = addDays(window.startDate, -1);
  const trail = addDays(window.endDate, 1);

  // Values are quoted so that PostgREST reads them as opaque strings: an
  // instant contains the `.` that separates a filter's parts, and quoting is
  // what says "the value starts here".
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
        // A fourth predicate, beyond the three in docs/ARCHITECTURE.md §11.
        // An override may move its occurrence to a different week, and then its
        // `occurrence_date` — the date the *rule* produced — is outside this
        // window while the block the user can see is inside it. Selecting
        // overrides only by that date makes such an occurrence disappear from
        // both weeks: absent here because its rule date is elsewhere, and
        // dropped there because `expandSeries` judges it on its new times.
        // Matching on the times as well is what makes a moved occurrence
        // findable in the week it was moved to.
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

/* -------------------------------------------------------------------------- */
/* Reads by identity                                                          */
/* -------------------------------------------------------------------------- */

/** One block, or null. A row hidden by RLS is indistinguishable from a missing one, by design. */
/**
 * Blocks completed inside a window of instants.
 *
 * "Completed" means the span was executed (Domain Rule 13), which is what the
 * `blocks_completed` quest metric counts — not that a task finished.
 */
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

export async function findById(client: MomentumClient, id: Uuid): Promise<CalendarBlock | null> {
  const { data, error } = await client
    .from("calendar_blocks")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data === null ? null : rowToCalendarBlock(data);
}

/**
 * The override row for one occurrence of a series, or null.
 *
 * `blocks_override_uniq` is a unique index on `(series_id, occurrence_date)`, so
 * there is at most one — which is also what makes writing an override idempotent
 * under retry (Domain Rule 17).
 */
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

/* -------------------------------------------------------------------------- */
/* Coverage                                                                   */
/* -------------------------------------------------------------------------- */

/** How much of a task's planned work is on the calendar, and how much of it is done. */
/**
 * Every work block belonging to a set of tasks, oldest first.
 *
 * This is Domain Rule 2 as a query: one task, N rows, ordered by when they
 * start. The detail sheet renders the whole list — "Mon 45m, Tue 60m, Thu 30m"
 * — and the coverage sum is taken over it. Unbounded by any calendar window,
 * because a task's blocks are its own regardless of which week is on screen.
 *
 * `blocks_task_idx` makes this an index scan on `task_id`.
 */
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
 * Work blocks whose span *starts* inside a window of instants.
 *
 * Analytics counts a block on the local date it starts, the same column the
 * calendar draws it in (Domain Rule 4), so the predicate is on `start_at`
 * alone — a block reaching into the window from the day before belongs to that
 * earlier day and is the previous period's.
 *
 * Only `work`: an event is somebody else's meeting and a habit block is
 * measured by its habit's completions, so neither is scheduled work the
 * scheduled-versus-completed comparison is about. Recurring rows cannot appear
 * here at all — only events recur (Domain Rule 16) — so there is nothing to
 * expand and no series to filter out.
 *
 * `blocks_user_start_idx` covers it.
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
 * Per-task work-block counts, unbounded by any window.
 *
 * Domain Rule 13 labels a block's completion control by what it will do — the
 * task's only block, or its last incomplete one, completes the task — and that
 * question is about *all* of the task's blocks, not the displayed week's. A
 * count restricted to the visible range would tell a user that Thursday's block
 * finishes the task while next Monday's was still outstanding.
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

/** What a habit block is labelled and coloured with: the habit's own name and hue. */
export interface HabitLabel {
  name: string;
  color: ProjectColor | null;
}

/**
 * The habits behind a set of habit blocks.
 *
 * A habit block carries no title of its own — `blocks_event_title_chk` requires
 * one only of events, because work and habit blocks display their parent's
 * (docs/DATABASE.md § calendar_blocks). Rendering the block therefore needs the
 * habit, exactly as rendering a work block needs its task.
 *
 * It lives here rather than in a habits repository for the same reason
 * `tasks.scheduledMinutesByTask` reads `calendar_blocks`: the question is "what
 * do I put on this block", which belongs to the block. Phase 6 owns habits
 * themselves and will bring its own repository; this reads two columns and
 * makes no claim on that.
 */
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

/**
 * Every habit block in a date range, for a set of habits.
 *
 * This is what "Add to week" reads before it writes: the dates already carrying
 * a block for the habit, so pressing the button twice tops the week up instead
 * of doubling it (`planHabitWeek` in `@momentum/core/habits`). It is also what
 * the habits page uses to show which days already have time reserved.
 *
 * The window is the half-open instant pair `[start, end)` a week resolves to,
 * matched the same way `listWindow` matches plain rows. `blocks_habit_idx`
 * covers the habit filter.
 */
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

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A row to create.
 *
 * `id` is optional but the calendar always supplies one: a client-generated
 * UUID means the optimistic row and the persisted row share a key and a retried
 * insert collides with itself instead of creating a duplicate (Domain Rule 17).
 * Override rows are the exception — their identity is `(series_id,
 * occurrence_date)`, which the unique index already enforces.
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
  };

  const { data, error } = await client.from("calendar_blocks").insert(row).select("*").single();

  if (error) throw error;
  return rowToCalendarBlock(data);
}

/**
 * A move, a resize, a retitle or a recolour — one row write.
 *
 * A drag that changes both the day and the duration is still one update, so the
 * grid never shows a block that has moved but not yet resized.
 */
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

/**
 * Deletes a block. Never touches its task or habit (Domain Rule 13): a block is
 * a plan for some time, and abandoning the plan is not abandoning the work.
 */
export async function remove(client: MomentumClient, id: Uuid): Promise<void> {
  const { error } = await client.from("calendar_blocks").delete().eq("id", id);
  if (error) throw error;
}

/* -------------------------------------------------------------------------- */
/* Trusted writes                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Records that a planned span was executed.
 *
 * `alsoCompleteTask` is the UI's decision, resolved on the server from the
 * task's other blocks (Domain Rule 13); the function does not recompute it. The
 * call goes through the database function because `completed_at` is guarded —
 * a direct update is refused even for the row's own owner (Domain Rule 15).
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
 * The completion control on a *habit* block.
 *
 * A separate function from `complete()` because completing a habit block is two
 * facts, not one: the planned span was executed (Domain Rule 13) and the habit
 * was done on the block's own local date (Domain Rule 14). `complete_habit_block`
 * writes both in one transaction, which is what makes "exactly one completion"
 * survive a retry — and what keeps `complete_block` doing exactly what Phase 3
 * said it does and nothing more.
 *
 * The completion's date and amount are the block's own, resolved server-side:
 * the client asserts neither.
 */
export async function completeHabit(client: MomentumClient, blockId: Uuid): Promise<CalendarBlock> {
  const { data, error } = await client.rpc("complete_habit_block", { p_block_id: blockId });

  if (error) throw error;
  return rowToCalendarBlock(data);
}

/**
 * Reverses it, and only as far as it went: the day's completion is removed only
 * when this block is the one that recorded it. A day ticked from the habits
 * page survives. XP is never withdrawn (Domain Rule 7).
 */
export async function uncompleteHabit(
  client: MomentumClient,
  blockId: Uuid,
): Promise<CalendarBlock> {
  const { data, error } = await client.rpc("uncomplete_habit_block", { p_block_id: blockId });

  if (error) throw error;
  return rowToCalendarBlock(data);
}
