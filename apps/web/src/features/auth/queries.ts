import "server-only";

import { profiles, type MomentumClient } from "@momentum/db";
import type { Profile } from "@momentum/core/types";

/**
 * Takes the client rather than building one so `lib/auth/session.ts` can
 * compose it into a single cached lookup without a circular import.
 */
export async function getProfileFor(
  client: MomentumClient,
  userId: string,
): Promise<Profile | null> {
  return profiles.getProfile(client, userId);
}
