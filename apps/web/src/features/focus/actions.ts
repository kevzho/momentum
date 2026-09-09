"use server";

import { refresh, revalidatePath } from "next/cache";

import { focus } from "@momentum/db";
import type { FocusSession } from "@momentum/core/types";

import { focusSessionInput, startFocusSessionInput } from "@/features/focus/schemas";
import {
  failure,
  success,
  validationError,
  type ActionErrorCode,
  type ActionResult,
} from "@/lib/actions/result";
import { requireSession } from "@/lib/auth/session";

/**
 * Focus session mutations. Each is a single RPC into the trusted focus
 * functions: `focus_sessions` and `focus_pauses` are client-read-only, and the
 * database stamps every time and decides every XP amount, so nothing here sends
 * either. All are idempotent, so the failure toast's retry is safe.
 */

export async function startFocusSession(input: unknown): Promise<ActionResult<FocusSession>> {
  const parsed = startFocusSessionInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { supabase } = await requireSession();
  return attempt(() => focus.start(supabase, parsed.data));
}

export async function pauseFocusSession(input: unknown): Promise<ActionResult<FocusSession>> {
  return lifecycle(input, (supabase, id) => focus.pause(supabase, id));
}

export async function resumeFocusSession(input: unknown): Promise<ActionResult<FocusSession>> {
  return lifecycle(input, (supabase, id) => focus.resume(supabase, id));
}

/** Interruptions are marked by the user, never inferred; marking one removes no time or points. */
export async function markFocusInterruption(input: unknown): Promise<ActionResult<FocusSession>> {
  return lifecycle(input, (supabase, id) => focus.markInterruption(supabase, id));
}

/** The measured minutes reach the session, the linked task and, once, the XP ledger. */
export async function finishFocusSession(input: unknown): Promise<ActionResult<FocusSession>> {
  return lifecycle(input, (supabase, id) => focus.finish(supabase, id));
}

/** Ending early still records the minutes on the session and task; only the XP is forgone. */
export async function endFocusSession(input: unknown): Promise<ActionResult<FocusSession>> {
  return lifecycle(input, (supabase, id) => focus.abandon(supabase, id));
}

type Lifecycle = (
  supabase: Awaited<ReturnType<typeof requireSession>>["supabase"],
  id: string,
) => Promise<FocusSession>;

async function lifecycle(
  input: unknown,
  operation: Lifecycle,
): Promise<ActionResult<FocusSession>> {
  const parsed = focusSessionInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { supabase } = await requireSession();
  return attempt(() => operation(supabase, parsed.data.id));
}

/** Finishing moves the linked task's `actual_minutes`, which `/tasks` and `/today` render. */
function revalidateFocusSurfaces(): void {
  refresh();
  revalidatePath("/tasks");
  revalidatePath("/today");
}

async function attempt(
  operation: () => Promise<FocusSession>,
): Promise<ActionResult<FocusSession>> {
  try {
    const data = await operation();
    revalidateFocusSurfaces();
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

/** Messages for the refusals a focus interaction can cause; none characterises the user or mentions XP. */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  focus_planned_chk: "A session is between 1 and 240 minutes.",
  focus_actual_range_chk: "A session cannot record negative time.",
  focus_order_chk: "A session cannot end before it started.",
  focus_pauses_order_chk: "A pause cannot end before it started.",
};

function describe(error: unknown): { code: ActionErrorCode; message: string } {
  if (!isDatabaseError(error)) {
    return {
      code: "unavailable",
      message: "Momentum could not reach the server. Your change was not saved.",
    };
  }

  switch (error.code) {
    case "42501":
      return { code: "forbidden", message: "That session belongs to another account." };
    case "P0002":
    case "PGRST116":
      return { code: "not_found", message: "That focus session no longer exists." };
    case "23503":
      return { code: "not_found", message: "That task no longer exists." };
    case "23505":
      // `focus_sessions_active_uniq`: one live session per account.
      return {
        code: "conflict",
        message: "A focus session is already running. Finish or end it before starting another.",
      };
    case "23514":
      return { code: "validation", message: constraintMessage(error.message) };
    case "22023":
      // e.g. "This session has already ended": already user-readable.
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
