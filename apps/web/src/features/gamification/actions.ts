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

// Every action sends an id, never an amount: XP, coins and prices are computed
// in the database. All are idempotent, so the failure toast's Retry is safe.

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

/** `enforce_one_equipped_per_kind()` keeps the one-per-kind invariant. */
export async function equipCosmetic(input: unknown): Promise<ActionResult<UserCosmetic>> {
  const parsed = equipCosmeticInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { supabase, userId } = await requireSession();
  return attempt(() =>
    gamification.equipCosmetic(supabase, userId, parsed.data.id, parsed.data.equipped),
  );
}

/** The target is capped at the same number a quest on that metric is; the reward is flat and server-decided. */
export async function createWeeklyGoal(input: unknown): Promise<ActionResult<WeeklyGoal>> {
  const parsed = createWeeklyGoalInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { supabase, userId, profile } = await requireSession();
  const week = weekOf(todayIn(profile.timezone, nowInstant()), profile.weekStart);

  return attempt(() =>
    gamification.insertWeeklyGoal(supabase, {
      id: parsed.data.id,
      userId,
      // Resolved from the profile, never sent: a goal filed under another week
      // would be claimable against the wrong rows.
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

// The top bar's level and coins render on every route, and the calendar's
// planning drawer shows weekly goals.
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

// None of these messages characterises the user.
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
      // Raised by the database in user-facing wording.
      return { code: "validation", message: error.message };
    default:
      return {
        code: "unavailable",
        message: "Momentum could not save that change. Please try again.",
      };
  }
}
