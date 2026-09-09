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
 * The six things a user can do to a focus session.
 *
 * Every one of them is a single RPC, because every one of them is a trusted
 * write: `focus_sessions` and `focus_pauses` are client-read-only, and
 * `20260907130000_focus_functions.sql` is the only path into them
 * (Domain Rule 15). There is no repository `insert` to call here and that is
 * deliberate — an action that could insert a session is an action that could
 * choose when it started.
 *
 * **Nothing here sends a time, and nothing sends an XP amount.** The whole
 * payload of "finish" is an id. What the session measured and what it earned
 * are computed by the database from rows it stamped itself (Domain Rules 6, 15).
 *
 * Every one is idempotent, so the retry a failure toast offers is safe: a start
 * carries its own id, and the other five converge on the state they name rather
 * than refusing a second call (Domain Rule 17).
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

/**
 * The user says they were interrupted.
 *
 * Nothing infers one. The application cannot see the user's window, their
 * phone or the person who walked in, and a count it guessed at would look
 * measured while being invented (Domain Rule 8's spirit). It costs nothing:
 * marking an interruption removes no time and no points (Domain Rule 7).
 */
export async function markFocusInterruption(input: unknown): Promise<ActionResult<FocusSession>> {
  return lifecycle(input, (supabase, id) => focus.markInterruption(supabase, id));
}

/**
 * Finishing: the measured minutes reach the session, the linked task and — once
 * — the XP ledger.
 */
export async function finishFocusSession(input: unknown): Promise<ActionResult<FocusSession>> {
  return lifecycle(input, (supabase, id) => focus.finish(supabase, id));
}

/**
 * Ending early.
 *
 * The minutes are still recorded, on the session and on the task: work done is
 * work done, and Domain Rule 3 calls that number the product's most valuable
 * long-term signal. What ending early forgoes is the XP, and nothing that was
 * already earned is taken back (Domain Rule 7).
 */
export async function endFocusSession(input: unknown): Promise<ActionResult<FocusSession>> {
  return lifecycle(input, (supabase, id) => focus.abandon(supabase, id));
}

/* -------------------------------------------------------------------------- */
/* Plumbing                                                                   */
/* -------------------------------------------------------------------------- */

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

/**
 * The reads a focus mutation invalidates.
 *
 * `/tasks` and `/today` are not precautionary: finishing a session moves the
 * linked task's `actual_minutes`, which the task list and its detail sheet
 * both render. A task still showing yesterday's total after a session that
 * just credited it is the silent divergence Domain Rule 11 forbids.
 */
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

/**
 * Messages for the refusals a focus interaction can actually cause.
 *
 * Each says what happened and what to do about it. None of them characterises
 * the user, and none mentions XP — a session that earned nothing is not a
 * failed session, and telling someone so at the moment they stop working would
 * be exactly the moralising Domain Rule 7 forbids.
 */
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
      // `focus_sessions_active_uniq`: one live session per account, which is
      // what stops two tabs double-counting the same half hour.
      return {
        code: "conflict",
        message: "A focus session is already running. Finish or end it before starting another.",
      };
    case "23514":
      return { code: "validation", message: constraintMessage(error.message) };
    case "22023":
      // "This session has already ended", written for a person to read.
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
