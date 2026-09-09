"use server";

import { refresh, revalidatePath } from "next/cache";

import { blocks, type MomentumClient } from "@momentum/db";
import { addMinutes, durationMinutes, fromLocal, minutesFromMidnight } from "@momentum/core/time";
import type {
  CalendarBlock,
  EventBlock,
  IanaTimeZone,
  Instant,
  LocalDate,
  Minutes,
  Uuid,
} from "@momentum/core/types";

import {
  createBlockInput,
  deleteBlockInput,
  deleteOccurrenceInput,
  rescheduleBlockInput,
  rescheduleOccurrenceInput,
  scheduleTaskInput,
  setBlockCompletionInput,
  updateBlockInput,
} from "@/features/calendar/schemas";
import {
  failure,
  success,
  validationError,
  type ActionErrorCode,
  type ActionResult,
} from "@/lib/actions/result";
import { requireSession } from "@/lib/auth/session";

/**
 * Every mutation the calendar can make.
 *
 * All of them share one shape (docs/ARCHITECTURE.md §6): validate with zod,
 * take the session, convert wall-clock input to instants with the *profile's*
 * timezone, call a repository, `refresh()` on success, and return an
 * `ActionResult`. Nothing here throws for a failure a user can legitimately
 * cause — a thrown error is a bug and belongs to an error boundary, and a drag
 * that lands on someone else's row is not a bug.
 *
 * The timezone conversion is the reason these take `{ date, startMinutes,
 * endMinutes }` rather than instants. The client is not allowed to assert an
 * instant: the profile timezone is the server's to apply (Domain Rule 4), and
 * keeping the conversion here means the DST rules below are decided once
 * instead of in every caller.
 */

/* -------------------------------------------------------------------------- */
/* Blocks                                                                     */
/* -------------------------------------------------------------------------- */

export async function createBlock(input: unknown): Promise<ActionResult<CalendarBlock>> {
  const parsed = createBlockInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, title, description, color, date, startMinutes, endMinutes } = parsed.data;
  const { supabase, userId, profile } = await requireSession();
  const span = spanInstants(date, startMinutes, endMinutes, profile.timezone);

  return attempt(() =>
    insertOnce(supabase, id, {
      id,
      userId,
      kind: "event",
      title,
      description,
      color,
      ...span,
    }),
  );
}

/** Content only. Times move through `rescheduleBlock`; completion through `setBlockCompletion`. */
export async function updateBlock(input: unknown): Promise<ActionResult<CalendarBlock>> {
  const parsed = updateBlockInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, title, description, color } = parsed.data;
  const { supabase } = await requireSession();

  return attempt(() => blocks.update(supabase, id, { title, description, color }));
}

/**
 * Move and resize, in one row write.
 *
 * A drag that changes the day and the duration at once is a single update, so
 * there is no instant at which the block has moved but not yet resized — and no
 * second failure that could leave it half-moved.
 */
export async function rescheduleBlock(input: unknown): Promise<ActionResult<CalendarBlock>> {
  const parsed = rescheduleBlockInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, date, startMinutes, endMinutes } = parsed.data;
  const { supabase, profile } = await requireSession();

  return attempt(() =>
    blocks.update(supabase, id, spanInstants(date, startMinutes, endMinutes, profile.timezone)),
  );
}

/** Deleting a block never touches its task or habit (Domain Rule 13). */
export async function deleteBlock(input: unknown): Promise<ActionResult<{ id: Uuid }>> {
  const parsed = deleteBlockInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id } = parsed.data;
  const { supabase } = await requireSession();

  return attempt(async () => {
    await blocks.remove(supabase, id);
    return { id };
  });
}

/**
 * A task dropped on the grid becomes a work block linked to it.
 *
 * The block carries no title of its own: it renders its task's, so the two can
 * never disagree (Domain Rule 2 — one task, many blocks). The block's time is
 * not the task's due date and nothing here touches `due_date`
 * (Domain Rule 1).
 */
export async function scheduleTask(input: unknown): Promise<ActionResult<CalendarBlock>> {
  const parsed = scheduleTaskInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, taskId, date, startMinutes, endMinutes } = parsed.data;
  const { supabase, userId, profile } = await requireSession();
  const span = spanInstants(date, startMinutes, endMinutes, profile.timezone);

  return attempt(() => insertOnce(supabase, id, { id, userId, kind: "work", taskId, ...span }));
}

/**
 * The completion control on a block.
 *
 * `completed_at` is a guarded column, so this is an RPC and not an update: the
 * database stamps the time with its own clock and the browser could not write
 * the column even by talking to PostgREST directly (Domain Rule 15).
 *
 * `alsoCompleteTask` carries the label's promise — the block was the task's only
 * one, or its last incomplete one — and is resolved on the server in
 * `queries.ts`, so the control's wording and its effect come from the same
 * calculation (Domain Rule 13). It is meaningless when un-completing: a block
 * that was executed and then was not says nothing about the task.
 */
export async function setBlockCompletion(input: unknown): Promise<ActionResult<CalendarBlock>> {
  const parsed = setBlockCompletionInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, completed, alsoCompleteTask, alsoUncompleteTask, habitId } = parsed.data;
  const { supabase } = await requireSession();

  /*
   * A habit block takes a different function, not a different argument
   * (Phase 6). Completing one is two facts in one transaction — the span was
   * executed, and the habit was done on the block's own local date — and
   * `complete_block` deliberately does only the first, which is all Domain
   * Rule 13 says it does. Splitting them into two calls from here would leave a
   * window in which the block was complete and the habit had no record of the
   * day, and a failed second call would strand it there.
   *
   * `habitId` only routes the call; the database re-reads the block and refuses
   * a non-habit block, so the client cannot reach this path with a work block.
   */
  if (habitId !== null) {
    return attempt(() =>
      completed ? blocks.completeHabit(supabase, id) : blocks.uncompleteHabit(supabase, id),
    );
  }

  return attempt(() =>
    completed
      ? blocks.complete(supabase, id, alsoCompleteTask)
      : blocks.uncomplete(supabase, id, alsoUncompleteTask),
  );
}

/* -------------------------------------------------------------------------- */
/* One occurrence of a recurring event                                        */
/* -------------------------------------------------------------------------- */

/**
 * Moving or resizing one occurrence writes an override row linked to the series
 * and the occurrence date (docs/ARCHITECTURE.md §11). The series is untouched;
 * every other occurrence keeps the rule's wall-clock time.
 *
 * Phase 3 does not build the recurring-event editor — "this and following" and
 * "all" are not here — but it does have to let a user drag one of these blocks,
 * and dragging one occurrence has exactly one correct meaning.
 */
export async function rescheduleOccurrence(input: unknown): Promise<ActionResult<CalendarBlock>> {
  const parsed = rescheduleOccurrenceInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { seriesId, occurrenceDate, date, startMinutes, endMinutes } = parsed.data;
  const { supabase, userId, profile } = await requireSession();
  const span = spanInstants(date, startMinutes, endMinutes, profile.timezone);

  return attempt(async () => {
    const series = await requireSeries(supabase, seriesId);
    return writeOverride(supabase, {
      userId,
      series,
      occurrenceDate,
      cancelled: false,
      ...span,
    });
  });
}

/**
 * Deleting one occurrence writes a *cancelled* override rather than removing
 * anything: the series has no row for that occurrence to delete, and the
 * expansion needs a marker to know to skip it. Nothing is destroyed, so
 * restoring the occurrence later is a row update.
 *
 * The cancelled row keeps the occurrence's own times. It has to carry a valid
 * span (`blocks_span_chk`), and the honest one is the span it is cancelling —
 * computed the way `expandSeries` computes it, from the series' wall clock in
 * the series' timezone (Domain Rule 16).
 */
export async function deleteOccurrence(input: unknown): Promise<ActionResult<CalendarBlock>> {
  const parsed = deleteOccurrenceInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { seriesId, occurrenceDate } = parsed.data;
  const { supabase, userId } = await requireSession();

  return attempt(async () => {
    const series = await requireSeries(supabase, seriesId);
    return writeOverride(supabase, {
      userId,
      series,
      occurrenceDate,
      cancelled: true,
      ...occurrenceSpan(series, occurrenceDate),
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Wall clock → instants                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The one conversion from what the user drew to what is stored.
 *
 * Both ends go through `fromLocal` with the profile timezone, because the grid
 * is laid out in wall clock and a block has to come back to the row the user
 * put it on. That is right on all but two days a year:
 *
 * - **Fall back.** Local 01:00–02:00 happens over two hours. `fromLocal` takes
 *   the first occurrence of an ambiguous reading, so the stored span is two
 *   hours long and renders on the rows the user drew. Preserving the drawn
 *   *length* instead would store one hour and draw a block half the height of
 *   the gesture that made it.
 * - **Spring forward.** Local 02:00–03:00 does not exist; `fromLocal` moves a
 *   reading inside the gap forward by the gap's width. Both ends move together
 *   unless the span straddles the gap's far edge — 02:30 to 03:00 resolves to
 *   03:30 and 03:00, in that order — which would be a block that ends before it
 *   starts and a `blocks_span_chk` violation. There the drawn length is the only
 *   meaning left, so it wins. `expandSeries` resolves the same collision the
 *   same way, and Domain Rule 3 is why: a block's length is the amount of the
 *   user's week it consumes.
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

/**
 * The span the rule would have given this occurrence, in the series' own
 * timezone — the same three lines `expandSeries` runs, because a cancelled or
 * newly created override has to describe the occurrence it replaces.
 */
function occurrenceSpan(
  series: EventBlock,
  occurrenceDate: LocalDate,
): { startAt: Instant; endAt: Instant } {
  const timezone = series.recurrence?.timezone;
  if (timezone === undefined) {
    throw new Error(`calendar_blocks ${series.id}: not a series`);
  }

  const startAt = fromLocal(
    occurrenceDate,
    minutesFromMidnight(series.startAt, timezone),
    timezone,
  );
  return { startAt, endAt: addMinutes(startAt, durationMinutes(series.startAt, series.endAt)) };
}

/* -------------------------------------------------------------------------- */
/* Repository plumbing                                                        */
/* -------------------------------------------------------------------------- */

async function requireSeries(client: MomentumClient, seriesId: Uuid): Promise<EventBlock> {
  const series = await blocks.findById(client, seriesId);
  if (series === null || series.kind !== "event" || series.recurrence === null) {
    throw new NotFound("That repeating event no longer exists.");
  }
  return series;
}

interface OverrideWrite {
  userId: Uuid;
  series: EventBlock;
  occurrenceDate: LocalDate;
  cancelled: boolean;
  startAt: Instant;
  endAt: Instant;
}

/**
 * Writes the one override row an occurrence may have.
 *
 * `blocks_override_uniq` is a unique index on `(series_id, occurrence_date)`, so
 * "already overridden" is a fact the database owns and the read-then-write below
 * cannot get wrong for long: a retry that races itself loses on the index and
 * takes the update path on the way back through. That is what makes dragging the
 * same occurrence twice, or retrying a lost response, idempotent
 * (Domain Rule 17).
 *
 * The row copies the series' title and colour because an override is a whole
 * event row, and `blocks_event_title_chk` requires events to have a title. It
 * carries no `recurrence` of its own — only a series row may
 * (`blocks_recurrence_kind_chk`).
 */
async function writeOverride(client: MomentumClient, write: OverrideWrite): Promise<CalendarBlock> {
  const existing = await blocks.findOverride(client, write.series.id, write.occurrenceDate);
  if (existing !== null) {
    return blocks.update(client, existing.id, {
      startAt: write.startAt,
      endAt: write.endAt,
      cancelled: write.cancelled,
    });
  }

  try {
    return await blocks.insert(client, {
      userId: write.userId,
      kind: "event",
      title: write.series.title,
      description: write.series.description,
      color: write.series.color,
      allDay: write.series.allDay,
      seriesId: write.series.id,
      occurrenceDate: write.occurrenceDate,
      cancelled: write.cancelled,
      startAt: write.startAt,
      endAt: write.endAt,
    });
  } catch (error) {
    if (!isCode(error, UNIQUE_VIOLATION)) throw error;
    const raced = await blocks.findOverride(client, write.series.id, write.occurrenceDate);
    if (raced === null) throw error;
    return blocks.update(client, raced.id, {
      startAt: write.startAt,
      endAt: write.endAt,
      cancelled: write.cancelled,
    });
  }
}

/**
 * An insert a retry may repeat.
 *
 * Ids are generated by the client (Domain Rule 17), so a create that was
 * persisted but whose response was lost collides with itself on the primary key
 * the second time round. That is the retry succeeding, not a conflict: the row
 * the user asked for exists and is theirs, so the action returns it. Any other
 * unique violation, and a collision whose row cannot be read back, is a real
 * failure and is re-thrown.
 */
async function insertOnce(
  client: MomentumClient,
  id: Uuid,
  block: blocks.NewBlock,
): Promise<CalendarBlock> {
  try {
    return await blocks.insert(client, block);
  } catch (error) {
    if (!isCode(error, UNIQUE_VIOLATION)) throw error;
    const existing = await blocks.findById(client, id);
    if (existing === null) throw error;
    return existing;
  }
}

/* -------------------------------------------------------------------------- */
/* Failure                                                                    */
/* -------------------------------------------------------------------------- */

const UNIQUE_VIOLATION = "23505";

/** Raised by this module where a repository would otherwise return null. */
class NotFound extends Error {}

/**
 * Runs a mutation and turns anything it throws into an `ActionResult`.
 *
 * `refresh()` re-renders the current route with server truth, which is what
 * replaces the optimistic state the client applied (docs/ARCHITECTURE.md §8).
 * It runs only on success: a failed mutation changed nothing, and re-rendering
 * would only cost a round trip on the way to a toast.
 *
 * `/today` and `/tasks` are invalidated as well, for the reason
 * `features/tasks/actions.ts` invalidates `/calendar`: a block moved or
 * completed on the board is on Today's timeline and is a task's coverage, and
 * a route that kept a stale copy of either would be showing the user something
 * the database no longer says (Phase 9).
 */
async function attempt<T>(operation: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await operation();
    refresh();
    revalidatePath("/today");
    revalidatePath("/tasks");
    return success(data);
  } catch (error) {
    const mapped = describe(error);
    return failure(mapped.code, mapped.message);
  }
}

/** The fields of a PostgREST error this module reads. */
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
 * Messages for the constraints a calendar interaction can actually trip.
 *
 * A constraint violation reaching the user means the client sent something the
 * grid should not have produced, so the message says what the rule is rather
 * than repeating Postgres at them. Anything not listed falls back to the
 * database's own message, which is still better than a generic apology.
 */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  blocks_span_chk: "A block has to end after it starts, and can be at most seven days long.",
  blocks_kind_shape_chk: "A work block needs a task, a habit block needs a habit.",
  blocks_event_title_chk: "Give the event a name.",
  blocks_override_shape_chk: "An edited occurrence needs both its series and its date.",
  blocks_recurrence_kind_chk: "Only events repeat.",
  blocks_cancelled_chk: "Only one occurrence of a repeating event can be cancelled.",
  tasks_status_completed_chk: "That task's status and completion time disagree.",
  habit_completions_amount_chk: "An amount has to be more than zero.",
};

/**
 * Maps a thrown value onto the six codes the UI branches on.
 *
 * The codes are Postgres SQLSTATEs, which PostgREST passes through verbatim:
 *
 *   42501  the row belongs to another account — `assert_caller`, or the
 *          guard triggers refusing a write to a guarded column
 *   P0002  the trusted functions' "no such row"
 *   PGRST116  a `.single()` that matched nothing, which RLS makes
 *          indistinguishable from a row that is not the caller's, by design
 *   23514  a check constraint; the constraint name is in the message
 *   22023  an argument the database rejected, e.g. completing a task from a
 *          block that has none
 *   23503  a foreign key: the task or series was deleted underneath the drag
 *   23505  a unique violation that was not the idempotent-create case above
 *
 * Anything else — including a fetch that never reached the database — is
 * `unavailable`. It is deliberately not re-thrown: an error boundary would
 * replace the whole calendar over one failed drag, and Domain Rule 11 asks for
 * the opposite, a visible failure and a clean roll-back.
 */
function describe(error: unknown): { code: ActionErrorCode; message: string } {
  if (error instanceof NotFound) {
    return { code: "not_found", message: error.message };
  }

  if (!isDatabaseError(error)) {
    return {
      code: "unavailable",
      message: "Momentum could not reach the server. Your change was not saved.",
    };
  }

  switch (error.code) {
    case "42501":
      return { code: "forbidden", message: "That is not yours to change." };
    case "P0002":
    case "PGRST116":
      return { code: "not_found", message: "That block no longer exists." };
    case "23503":
      return { code: "not_found", message: "The task this block belongs to no longer exists." };
    case UNIQUE_VIOLATION:
      return { code: "conflict", message: "That occurrence has already been edited." };
    case "23514":
      return { code: "validation", message: constraintMessage(error.message) };
    case "22023":
      return { code: "validation", message: error.message };
    default:
      return {
        code: "unavailable",
        message: "Momentum could not save that change. Please try again.",
      };
  }
}

function constraintMessage(message: string): string {
  for (const [constraint, text] of Object.entries(CONSTRAINT_MESSAGES)) {
    if (message.includes(constraint)) return text;
  }
  return message;
}
