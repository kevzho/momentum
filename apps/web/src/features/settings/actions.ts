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
 * Returns the whole profile rather than the patch: overlapping windows are
 * merged by the schema, and the page re-seeds its controls from the answer.
 */
export async function updateProfileSettings(input: unknown): Promise<ActionResult<Profile>> {
  const parsed = updateProfileSettingsInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { supabase, userId } = await requireSession();

  return attempt(() => profiles.updateProfileSettings(supabase, userId, parsed.data));
}

// `/calendar` is revalidated too: working hours, focus windows, timezone and
// week start all feed the planning drawer.
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

const CONSTRAINT_MESSAGES: Record<string, string> = {
  profiles_display_name_chk: "Display names are at most 80 characters.",
  profiles_week_start_chk: "Week start is a day of the week.",
  profiles_snap_minutes_chk: "Snapping is 5, 10, 15 or 30 minutes.",
  profiles_working_hours_chk: "Working hours are a set of windows for each day.",
  profiles_focus_windows_chk: "Focus windows are a list of windows.",
};

// `validate_timezone()` raises `22023` with `invalid timezone: <name>`
// (`supabase/migrations/20260906120000_enums_and_helpers.sql`).
const INVALID_TIMEZONE = /^invalid timezone: (.*)$/;

// Postgres SQLSTATEs, passed through by PostgREST verbatim. Nothing is
// re-thrown: an error boundary over one failed save is worse than a toast.
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
