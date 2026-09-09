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
 * Habit mutations. A completion is never a direct write to `habit_completions`:
 * the table is client-read-only, and `record_habit_completion` resolves the date
 * in the profile timezone, keeps one row per day and awards XP once. Nothing
 * here removes earned XP: archiving keeps completions, and un-recording a day
 * leaves its XP in the append-only ledger.
 */

export async function createHabit(input: unknown): Promise<ActionResult<Habit>> {
  const parsed = createHabitInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, ...fields } = parsed.data;
  const { supabase, userId } = await requireSession();

  return attempt(async () => {
    try {
      return await habits.insert(supabase, { id, userId, ...fields });
    } catch (error) {
      // A retry after a lost response collides with itself on the primary key;
      // that is the retry succeeding.
      if (!isCode(error, UNIQUE_VIOLATION)) throw error;
      const existing = await habits.findById(supabase, id);
      if (existing === null) throw error;
      return existing;
    }
  });
}

/** The whole form in one write. Changing a target never rewrites past completions. */
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
 * Deletes the habit and, by cascade, its completions and calendar blocks. Earned
 * XP stays in the ledger, which has no foreign key on `source_id` for that reason.
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

/**
 * Records or un-records one day. Both directions go through the trusted
 * functions and are idempotent, so repeated presses from any surface reach the
 * same row; removing an unrecorded day returns null.
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

/**
 * Reserves calendar time for a habit across one week via `planHabitWeek`,
 * differenced against the blocks already placed, so a second press tops the
 * week up rather than doubling it. Returns only the blocks created.
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
    // `startOfDay` handles the 23/25-hour local days either side of a DST transition.
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
          // No title: a habit block renders its habit's name at read time, so the two never drift.
          ...spanInstants(plan.date, plan.startMinutes, plan.endMinutes, timezone),
        }),
      );
    }
    return created;
  });
}

/**
 * Same conversion as `features/calendar/actions.ts`: the client never asserts
 * an instant, and DST collisions resolve one way product-wide.
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

/** `/calendar` and `/today` render habit blocks and their completion state, so both are invalidated. */
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

/** Messages for the constraints a habit interaction can trip; none characterises the user. */
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
      // `habit_completions_uniq`: the trusted function upserts, so reaching this
      // means two writes raced; the row exists either way.
      return { code: "conflict", message: "That day is already recorded." };
    case "23514":
      return { code: "validation", message: constraintMessage(error.message) };
    case "22023":
      // The recording-window and "not a habit block" refusals carry a user-readable message.
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
