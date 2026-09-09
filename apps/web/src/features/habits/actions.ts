"use server";

import { refresh, revalidatePath } from "next/cache";

import { blocks, habits } from "@momentum/db";
import { planHabitWeek } from "@momentum/core/habits";
import {
  addDays,
  addMinutes,
  fromLocal,
  localDateOf,
  nowInstant,
  startOfDay,
  todayIn,
  weekOf,
} from "@momentum/core/time";
import type {
  CalendarBlock,
  Habit,
  HabitCompletion,
  IanaTimeZone,
  Instant,
  LocalDate,
  Minutes,
  Uuid,
} from "@momentum/core/types";

import {
  addHabitToWeekInput,
  archiveHabitInput,
  createHabitInput,
  deleteHabitInput,
  setHabitCompletionInput,
  updateHabitInput,
} from "@/features/habits/schemas";
import {
  failure,
  success,
  validationError,
  type ActionErrorCode,
  type ActionResult,
} from "@/lib/actions/result";
import { requireSession } from "@/lib/auth/session";

/**
 * Every mutation the habits surface can make.
 *
 * The shape is the calendar's and the task manager's (docs/ARCHITECTURE.md §6):
 * validate with zod, take the session, call a repository, revalidate, return an
 * `ActionResult`. Nothing throws for a failure a user can cause.
 *
 * Two things are specific to this feature.
 *
 * **A completion is never a write to `habit_completions`.** The table is
 * client-read-only; `record_habit_completion` computes the date in the profile
 * timezone, holds the one-row-per-day invariant and awards the XP once
 * (Domain Rules 4, 6, 14, 15). The client sends a calendar date, not an
 * instant, and never an XP amount.
 *
 * **Nothing here removes anything the user has earned.** Archiving keeps every
 * completion and every point (Domain Rule 7). Un-recording a day deletes that
 * day's row and leaves its XP in the ledger, because the ledger is append-only.
 */

/* -------------------------------------------------------------------------- */
/* Habits                                                                     */
/* -------------------------------------------------------------------------- */

export async function createHabit(input: unknown): Promise<ActionResult<Habit>> {
  const parsed = createHabitInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, ...fields } = parsed.data;
  const { supabase, userId } = await requireSession();

  return attempt(async () => {
    try {
      return await habits.insert(supabase, { id, userId, ...fields });
    } catch (error) {
      // A retry after a lost response collides with itself on the primary key.
      // That is the retry succeeding (Domain Rule 17).
      if (!isCode(error, UNIQUE_VIOLATION)) throw error;
      const existing = await habits.findById(supabase, id);
      if (existing === null) throw error;
      return existing;
    }
  });
}

/**
 * The whole form in one write, so a save cannot half-apply.
 *
 * Changing a habit's target does not rewrite its history: the completions are
 * what happened, and re-scoring past days against a new rule would be a
 * retroactive judgement of days the user cannot go back and change
 * (Domain Rule 7).
 */
export async function updateHabit(input: unknown): Promise<ActionResult<Habit>> {
  const parsed = updateHabitInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, ...patch } = parsed.data;
  const { supabase } = await requireSession();

  return attempt(() => habits.update(supabase, id, patch));
}

/** "Not tracking this any more", with everything kept. */
export async function archiveHabit(input: unknown): Promise<ActionResult<Habit>> {
  const parsed = archiveHabitInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, archived } = parsed.data;
  const { supabase } = await requireSession();

  return attempt(() => habits.setArchived(supabase, id, archived));
}

/**
 * Deletes the habit, and by cascade its completions and its calendar blocks.
 *
 * The destructive route, offered beside archiving and never instead of it. The
 * XP those completions earned stays in the ledger, which has no foreign key on
 * `source_id` precisely so that it outlives what earned it.
 */
export async function deleteHabit(input: unknown): Promise<ActionResult<{ id: Uuid }>> {
  const parsed = deleteHabitInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id } = parsed.data;
  const { supabase } = await requireSession();

  return attempt(async () => {
    await habits.remove(supabase, id);
    return { id };
  });
}

/* -------------------------------------------------------------------------- */
/* Completions                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Recording, or un-recording, one day.
 *
 * Both directions go through the trusted functions, and both are idempotent:
 * recording a boolean habit twice on one day is a no-op, and removing a day
 * that was never recorded returns null rather than failing. That is what makes
 * "exactly one completion" true no matter how many times the control is
 * pressed, or which surface pressed it — the calendar block and this row reach
 * the same database row (Domain Rule 14).
 */
export async function setHabitCompletion(
  input: unknown,
): Promise<ActionResult<HabitCompletion | null>> {
  const parsed = setHabitCompletionInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { habitId, date, recorded, amount } = parsed.data;
  const { supabase } = await requireSession();

  return attempt(() =>
    recorded
      ? habits.recordCompletion(supabase, habitId, date, amount)
      : habits.removeCompletion(supabase, habitId, date),
  );
}

/* -------------------------------------------------------------------------- */
/* Add to week                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Reserves calendar time for a habit across one week.
 *
 * The plan is `planHabitWeek` in `@momentum/core/habits` — the same pure
 * function the tests cover — run against the blocks that already exist, so:
 *
 * - a per-day habit gets one block on each of its remaining scheduled days;
 * - `times_per_week` gets its target spread across the days still available,
 *   counting blocks already placed toward it;
 * - `amount_per_week` gets one session, because its target is a quantity and
 *   says nothing about how many sittings it takes;
 * - days already carrying a block for this habit are never planned again, so
 *   pressing the button twice tops the week up rather than doubling it.
 *
 * The wall-clock spans it returns are converted here, with the profile
 * timezone, by the same `spanInstants` rule the calendar's own actions use — a
 * habit block is an ordinary `calendar_blocks` row and is created the same way
 * a dragged task is (Domain Rule 4, docs/ARCHITECTURE.md §11).
 */
export async function addHabitToWeek(input: unknown): Promise<ActionResult<CalendarBlock[]>> {
  const parsed = addHabitToWeekInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { habitId, weekStartDate } = parsed.data;
  const { supabase, userId, profile } = await requireSession();
  const timezone = profile.timezone;

  return attempt(async () => {
    const habit = await habits.findById(supabase, habitId);
    if (habit === null) throw new NotFound("That habit no longer exists.");

    const week = weekOf(weekStartDate, profile.weekStart);
    const days = week.days;
    // The half-open instant window the week covers, resolved exactly as the
    // calendar's own reads resolve it: `startOfDay` knows that the local days
    // either side of a DST transition are 23 or 25 hours long.
    const window = {
      start: startOfDay(week.start, timezone),
      end: startOfDay(addDays(week.start, 7), timezone),
    };

    const existing = await blocks.listForHabits(supabase, [habitId], window);
    const occupied = existing
      .filter((block) => block.kind === "habit")
      .map((block) => localDateOf(block.startAt, timezone));

    const plans = planHabitWeek({
      habit,
      days,
      today: todayIn(timezone, nowInstant()),
      occupied,
    });

    const created: CalendarBlock[] = [];
    for (const plan of plans) {
      created.push(
        await blocks.insert(supabase, {
          userId,
          kind: "habit",
          habitId,
          // No title: a habit block renders its habit's name, resolved at read
          // time, so the two can never drift (docs/DOMAIN_RULES.md §19).
          ...spanInstants(plan.date, plan.startMinutes, plan.endMinutes, timezone),
        }),
      );
    }
    return created;
  });
}

/* -------------------------------------------------------------------------- */
/* Wall clock → instants                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The same conversion `features/calendar/actions.ts` makes, and for the same
 * reason: the client is not allowed to assert an instant, and the DST
 * collisions have one resolution in this product, not one per caller.
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

class NotFound extends Error {}

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
 * The reads a habit mutation invalidates.
 *
 * `/calendar` and `/today` are not precautionary: "Add to week" writes rows the
 * week grid renders, deleting a habit takes its blocks with it, and completing
 * a habit changes how its block is drawn. A calendar still showing a block the
 * user just removed is the silent divergence Domain Rule 11 forbids.
 */
function revalidateHabitSurfaces(): void {
  refresh();
  revalidatePath("/calendar");
  revalidatePath("/today");
}

async function attempt<T>(operation: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await operation();
    revalidateHabitSurfaces();
    return success(data);
  } catch (error) {
    const mapped = describe(error);
    return failure(mapped.code, mapped.message);
  }
}

/**
 * Messages for the constraints a habit interaction can actually trip.
 *
 * Each says what the rule is, in the product's own voice. None of them
 * characterises the user (Domain Rule 7) — a rejected form is a form, not a
 * verdict.
 */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  habits_name_chk: "A habit needs a name, and it can be at most 100 characters.",
  habits_target_positive_chk: "A target is at least 1.",
  habits_target_chk: "This habit is done once on each of its days, so its target is 1.",
  habits_weekdays_chk: "Choose at least one day for this habit.",
  habits_unit_chk: "Only an amount habit is measured in minutes.",
  habits_active_days_chk: "Days are Sunday to Saturday.",
  habits_estimate_chk: "A session is between a minute and twelve hours.",
  habits_xp_reward_chk: "A habit is worth between 0 and 50 points.",
  habit_completions_amount_chk: "An amount has to be more than zero.",
  blocks_span_chk: "A block has to end after it starts.",
  blocks_kind_shape_chk: "A habit block needs a habit.",
};

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
      return { code: "forbidden", message: "That habit belongs to another account." };
    case "P0002":
    case "PGRST116":
      return { code: "not_found", message: "That habit no longer exists." };
    case "23503":
      return { code: "not_found", message: "That habit no longer exists." };
    case UNIQUE_VIOLATION:
      // `habit_completions_uniq` is the one-row-per-day rule (Domain Rule 14).
      // The trusted function upserts, so reaching this means two writes raced;
      // the row the user asked for exists either way.
      return { code: "conflict", message: "That day is already recorded." };
    case "23514":
      return { code: "validation", message: constraintMessage(error.message) };
    case "22023":
      // The recording window and the "this is not a habit block" refusals both
      // arrive here with a message written for a person to read.
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
