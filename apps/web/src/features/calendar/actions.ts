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
 * Every calendar mutation: validate, take the session, convert wall-clock
 * input to instants with the profile's timezone, call a repository, refresh on
 * success, return an `ActionResult`. User-causable failures never throw.
 */

export async function createBlock(input: unknown): Promise<ActionResult<CalendarBlock>> {
  const parsed = createBlockInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, title, description, color, date, startMinutes, endMinutes, recurrence } = parsed.data;
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
      // The schedule is defined in the profile's zone from now on (Domain Rule 16).
      ...(recurrence === null ? {} : { recurrence: { ...recurrence, timezone: profile.timezone } }),
    }),
  );
}

/** Content only. Times move through `rescheduleBlock`; completion through `setBlockCompletion`. */
export async function updateBlock(input: unknown): Promise<ActionResult<CalendarBlock>> {
  const parsed = updateBlockInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, title, description, color, recurrence } = parsed.data;
  const { supabase, profile } = await requireSession();

  return attempt(async () => {
    if (recurrence === undefined) return blocks.update(supabase, id, { title, description, color });
    // A series keeps the timezone it was defined in; a plain event starting to
    // repeat takes the profile's. The database refuses a rule on anything else.
    const existing = await blocks.findById(supabase, id);
    const timezone =
      existing?.kind === "event" && existing.recurrence !== null
        ? existing.recurrence.timezone
        : profile.timezone;
    return blocks.update(supabase, id, {
      title,
      description,
      color,
      recurrence: recurrence === null ? null : { ...recurrence, timezone },
    });
  });
}

/** Move and resize, in one row write. */
export async function rescheduleBlock(input: unknown): Promise<ActionResult<CalendarBlock>> {
  const parsed = rescheduleBlockInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, date, startMinutes, endMinutes } = parsed.data;
  const { supabase, profile } = await requireSession();

  return attempt(() =>
    blocks.update(supabase, id, spanInstants(date, startMinutes, endMinutes, profile.timezone)),
  );
}

/** Deleting a block never touches its task or habit. */
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

/** A task dropped on the grid becomes a work block linked to it; `due_date` is never touched. */
export async function scheduleTask(input: unknown): Promise<ActionResult<CalendarBlock>> {
  const parsed = scheduleTaskInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, taskId, date, startMinutes, endMinutes } = parsed.data;
  const { supabase, userId, profile } = await requireSession();
  const span = spanInstants(date, startMinutes, endMinutes, profile.timezone);

  return attempt(() => insertOnce(supabase, id, { id, userId, kind: "work", taskId, ...span }));
}

/**
 * `completed_at` is a guarded column, so this is an RPC and not an update: the
 * database stamps the time with its own clock.
 */
export async function setBlockCompletion(input: unknown): Promise<ActionResult<CalendarBlock>> {
  const parsed = setBlockCompletionInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, completed, alsoCompleteTask, alsoUncompleteTask, habitId } = parsed.data;
  const { supabase } = await requireSession();

  // A habit block's completion also records the habit's day, in one
  // transaction. `habitId` only routes the call; the database refuses a non-habit block.
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

/** Moving or resizing one occurrence writes an override row; the series is untouched. */
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
 * Deleting one occurrence writes a cancelled override; nothing is destroyed.
 * The row must carry a valid span (`blocks_span_chk`), so it keeps the
 * occurrence's own times.
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

/**
 * Wall clock → instants. Both ends go through `fromLocal` so the block lands
 * on the rows the user drew (a fall-back 01:00–02:00 is two hours). A span
 * straddling the far edge of a spring-forward gap resolves inverted, so there
 * the drawn length wins. Must match `expandSeries` and `intervalOfSlot`.
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

/** The span the rule would have given this occurrence; the same computation as `expandSeries`. */
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
 * Writes the one override row an occurrence may have. A racing insert loses
 * on `blocks_override_uniq` and takes the update path, which is what makes a
 * retry idempotent. The row copies the series' title because
 * `blocks_event_title_chk` requires one.
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
 * An insert a retry may repeat: with client-generated ids a lost response
 * collides with itself on the primary key, and that row is the success. Any
 * other unique violation is re-thrown.
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

const UNIQUE_VIOLATION = "23505";

/** Raised by this module where a repository would otherwise return null. */
class NotFound extends Error {}

/**
 * Runs a mutation and turns anything it throws into an `ActionResult`.
 * `refresh()` replaces the optimistic state with server truth, on success
 * only. `/today` and `/tasks` show the same blocks, so they are invalidated too.
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

// Anything not listed falls back to the database's own message.
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
 * Maps a thrown value onto the codes the UI branches on. SQLSTATEs pass
 * through PostgREST verbatim: 42501 another account's row or a guarded column;
 * P0002 / PGRST116 no such row (RLS makes the two indistinguishable by design);
 * 23514 check constraint; 22023 rejected argument; 23503 parent deleted.
 * Anything else is `unavailable` and deliberately not re-thrown.
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
