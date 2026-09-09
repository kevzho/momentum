"use server";

import { refresh, revalidatePath } from "next/cache";

import { profiles } from "@momentum/db";
import type { Profile } from "@momentum/core/types";

import { updateProfileSettingsInput } from "@/features/settings/schemas";
import {
  failure,
  success,
  validationError,
  type ActionErrorCode,
  type ActionResult,
} from "@/lib/actions/result";
import { requireSession } from "@/lib/auth/session";

/**
 * The settings page's one mutation.
 *
 * The shape every action shares (docs/ARCHITECTURE.md §6): validate with zod,
 * take the session, call a repository, `refresh()` on success, return an
 * `ActionResult`. The row is the caller's own profile — `userId` comes from
 * the verified session, never from the input — and row-level security is
 * what makes a crafted request against someone else's row match nothing.
 *
 * It returns the whole profile rather than the patch, because the stored
 * value can differ from what was sent: overlapping windows are merged by the
 * schema, and the page re-seeds its controls from the answer so what the user
 * sees is what was saved.
 */
export async function updateProfileSettings(input: unknown): Promise<ActionResult<Profile>> {
  const parsed = updateProfileSettingsInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { supabase, userId } = await requireSession();

  return attempt(() => profiles.updateProfileSettings(supabase, userId, parsed.data));
}

/* -------------------------------------------------------------------------- */
/* Failure                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Runs the mutation and turns anything it throws into an `ActionResult`.
 *
 * On success the current route is refreshed, and `/calendar` is revalidated
 * with it: working hours and focus windows are inputs to the planning
 * drawer's capacity and Find Time maths, and the timezone and week start
 * decide which column is which. Every `(app)` route is dynamic and reads the
 * profile per request, so nothing else holds a stale copy to invalidate
 * (docs/ARCHITECTURE.md §5).
 */
async function attempt<T>(operation: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await operation();
    refresh();
    revalidatePath("/calendar");
    revalidatePath("/settings");
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

/**
 * Messages for the constraints a settings write can trip. Each mirrors a rule
 * the schema already checks, so reaching one means the client sent something
 * the page should not have produced; the message states the rule rather than
 * repeating Postgres.
 */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  profiles_display_name_chk: "Display names are at most 80 characters.",
  profiles_week_start_chk: "Week start is a day of the week.",
  profiles_snap_minutes_chk: "Snapping is 5, 10, 15 or 30 minutes.",
  profiles_working_hours_chk: "Working hours are a set of windows for each day.",
  profiles_focus_windows_chk: "Focus windows are a list of windows.",
};

/**
 * `validate_timezone()` raises `22023` with `invalid timezone: <name>`
 * (`supabase/migrations/20260906120000_enums_and_helpers.sql`). The name is
 * the useful part — it is what the user just chose — so it is lifted out and
 * put in a sentence rather than the trigger's wording being shown as-is.
 */
const INVALID_TIMEZONE = /^invalid timezone: (.*)$/;

/**
 * Maps a thrown value onto the codes the UI branches on. The codes are
 * Postgres SQLSTATEs, which PostgREST passes through verbatim:
 *
 *   42501  the row is not the caller's, or a guard trigger refused a write
 *          to a guarded column
 *   PGRST116  `.single()` matched nothing — the profile is hidden or gone
 *   23514  a check constraint; the constraint name is in the message
 *   22023  an argument the database rejected: the timezone trigger
 *
 * Anything else — including a fetch that never reached the database — is
 * `unavailable`, and is not re-thrown: a settings page replaced by an error
 * boundary over one failed save is worse than a toast (Domain Rule 11).
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
      return { code: "forbidden", message: "That profile is not yours to change." };
    case "PGRST116":
      return { code: "not_found", message: "Your profile could not be found." };
    case "23514": {
      const named = Object.keys(CONSTRAINT_MESSAGES).find((name) => error.message.includes(name));
      return {
        code: "validation",
        message: named ? (CONSTRAINT_MESSAGES[named] as string) : error.message,
      };
    }
    case "22023": {
      const zone = INVALID_TIMEZONE.exec(error.message)?.[1];
      return {
        code: "validation",
        message:
          zone === undefined
            ? error.message
            : `${zone.trim()} is not a timezone Momentum recognises.`,
      };
    }
    default:
      return {
        code: "unavailable",
        message: "Momentum could not save that change. Please try again.",
      };
  }
}
