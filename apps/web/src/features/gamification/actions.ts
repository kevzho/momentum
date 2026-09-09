"use server";

import { refresh, revalidatePath } from "next/cache";

import { gamification } from "@momentum/db";
import { nowInstant, todayIn, weekOf } from "@momentum/core/time";
import type { QuestAssignment, UserCosmetic, WeeklyGoal } from "@momentum/core/types";

import {
  createWeeklyGoalInput,
  equipCosmeticInput,
  idInput,
} from "@/features/gamification/schemas";
import {
  failure,
  success,
  validationError,
  type ActionErrorCode,
  type ActionResult,
} from "@/lib/actions/result";
import { requireSession } from "@/lib/auth/session";

/**
 * The five things a user can do to their own progression.
 *
 * **Look at what each of them sends: an id.** Not an amount, not a level, not a
 * coin balance, not a progress figure. Claiming a quest names the assignment
 * and the database recomputes the work from `tasks`, `focus_sessions`,
 * `habit_completions` and `calendar_blocks` before it writes anything; buying a
 * cosmetic names the cosmetic and the database reads the price from a row only
 * a migration can write. There is no path from this file to an XP amount, and
 * that is Domain Rule 6 made structural rather than promised.
 *
 * Every one is idempotent, so the retry a failure toast offers is safe: a
 * claimed quest returns unchanged, a purchase already made returns the row it
 * made, and a weekly goal carries a client-generated id (Domain Rule 17).
 */

export async function claimQuest(input: unknown): Promise<ActionResult<QuestAssignment>> {
  const parsed = idInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { supabase } = await requireSession();
  return attempt(() => gamification.claimQuest(supabase, parsed.data.id));
}

export async function claimWeeklyGoal(input: unknown): Promise<ActionResult<WeeklyGoal>> {
  const parsed = idInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { supabase } = await requireSession();
  return attempt(() => gamification.claimWeeklyGoal(supabase, parsed.data.id));
}

/** Coins are checked and debited in the same transaction as the grant. */
export async function purchaseCosmetic(input: unknown): Promise<ActionResult<UserCosmetic>> {
  const parsed = idInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { supabase } = await requireSession();
  return attempt(() => gamification.purchaseCosmetic(supabase, parsed.data.id));
}

/**
 * Wearing something already owned.
 *
 * The one ordinary write on this surface, and it stays ordinary on purpose:
 * which of your own cosmetics you are wearing is not a fact the server has any
 * reason to arbitrate, and `enforce_one_equipped_per_kind()` keeps the
 * invariant that matters.
 */
export async function equipCosmetic(input: unknown): Promise<ActionResult<UserCosmetic>> {
  const parsed = equipCosmeticInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { supabase, userId } = await requireSession();
  return attempt(() =>
    gamification.equipCosmetic(supabase, userId, parsed.data.id, parsed.data.equipped),
  );
}

/**
 * A weekly goal the user sets themselves.
 *
 * The target is capped at the same number a *quest* on that metric is capped
 * at, in the schema as well as here: a goal that pushed someone into an
 * unhealthy week would be no better for having been self-set (Domain Rule 7).
 * The reward for reaching it is flat and decided by the server, so a bigger
 * number in this field buys nothing.
 */
export async function createWeeklyGoal(input: unknown): Promise<ActionResult<WeeklyGoal>> {
  const parsed = createWeeklyGoalInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { supabase, userId, profile } = await requireSession();
  const week = weekOf(todayIn(profile.timezone, nowInstant()), profile.weekStart);

  return attempt(() =>
    gamification.insertWeeklyGoal(supabase, {
      id: parsed.data.id,
      userId,
      // The week is resolved from the profile, never sent: a goal filed under a
      // week the user is not in would be claimable against the wrong rows.
      weekStart: week.start,
      metric: parsed.data.metric,
      target: parsed.data.target,
      title: parsed.data.title,
    }),
  );
}

export async function deleteWeeklyGoal(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = idInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { supabase } = await requireSession();
  return attempt(async () => {
    await gamification.removeWeeklyGoal(supabase, parsed.data.id);
    return { id: parsed.data.id };
  });
}

/* -------------------------------------------------------------------------- */
/* Plumbing                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The reads a progression mutation invalidates.
 *
 * The top bar's level and coin count are rendered by the authenticated layout,
 * so every route shows them — which means a claim made on /progress has to
 * refresh more than /progress. The calendar's planning drawer shows weekly
 * goals for the same reason.
 */
function revalidateProgressSurfaces(): void {
  refresh();
  revalidatePath("/calendar");
  revalidatePath("/today");
}

async function attempt<T>(operation: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await operation();
    revalidateProgressSurfaces();
    return success(data);
  } catch (error) {
    const mapped = describe(error);
    return failure(mapped.code, mapped.message);
  }
}

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

/**
 * Messages for the refusals a progression interaction can actually cause.
 *
 * Each says what happened and what to do next. None of them characterises the
 * user: a quest that is not finished is not finished, and the copy says so
 * without saying anything about the person who has not finished it
 * (Domain Rule 7).
 */
function describe(error: unknown): { code: ActionErrorCode; message: string } {
  if (!isDatabaseError(error)) {
    return {
      code: "unavailable",
      message: "Momentum could not reach the server. Your change was not saved.",
    };
  }

  switch (error.code) {
    case "42501":
      return { code: "forbidden", message: "That belongs to another account." };
    case "P0002":
    case "PGRST116":
      return { code: "not_found", message: "That no longer exists." };
    case "23505":
      return { code: "conflict", message: "You already have a goal for that this week." };
    case "23514":
      return { code: "validation", message: "A weekly goal has to ask for a reachable amount." };
    case "22023":
      // Written for a person to read: "that quest is not finished yet",
      // "that costs 120 coins and you have 40".
      return { code: "validation", message: error.message };
    default:
      return {
        code: "unavailable",
        message: "Momentum could not save that change. Please try again.",
      };
  }
}
