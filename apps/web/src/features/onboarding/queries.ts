import "server-only";

import { blocks, tasks } from "@momentum/db";

import type { OnboardingState } from "@/features/onboarding/types";
import { requireSession } from "@/lib/auth/session";

/**
 * The checklist's facts, or null once the account has finished or skipped it.
 * Two counts, not a stored progress record: the steps complete themselves when
 * the data exists, so the data is what is read.
 */
export async function getOnboarding(): Promise<OnboardingState | null> {
  const { supabase, userId, profile } = await requireSession();
  if (profile.onboardingDismissedAt !== null) return null;

  const [taskCount, hasWorkBlock] = await Promise.all([
    tasks.countTopLevelFor(supabase, userId),
    blocks.hasWorkBlock(supabase, userId),
  ]);

  return {
    workingHoursSet: profile.workingHoursSetAt !== null,
    taskCount,
    hasWorkBlock,
  };
}
