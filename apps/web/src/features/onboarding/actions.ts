"use server";

import { profiles } from "@momentum/db";

import { failure, success, type ActionResult } from "@/lib/actions/result";
import { requireSession } from "@/lib/auth/session";

/**
 * Ends the first-run checklist for good. Deliberately no `refresh()`: the
 * checklist calls this the moment its last step completes and keeps showing
 * the finished list until the user navigates, rather than vanishing under
 * the drop that finished it. Skipping goes through the same path.
 */
export async function dismissOnboarding(): Promise<ActionResult<null>> {
  const { supabase, userId } = await requireSession();

  try {
    await profiles.dismissOnboarding(supabase, userId);
    return success(null);
  } catch {
    return failure("unavailable", "Momentum could not save that change. Please try again.");
  }
}
