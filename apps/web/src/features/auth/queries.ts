import "server-only";

import { profiles, type MomentumClient } from "@momentum/db";
import type { Profile } from "@momentum/core/types";

/**
 * Server-only reads for the auth feature.
 *
 * This is one of the three places allowed to touch `@momentum/db`
 * (docs/ARCHITECTURE.md §6). It takes the client rather than building one, so
 * `lib/auth/session.ts` can compose "who is signed in" and "what is their
 * profile" into a single cached lookup without this module importing it back.
 */
export async function getProfileFor(
  client: MomentumClient,
  userId: string,
): Promise<Profile | null> {
  return profiles.getProfile(client, userId);
}
