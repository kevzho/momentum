import type { Profile } from "@momentum/core/types";

import {
  profileSettingsToUpdate,
  rowToProfile,
  type ProfileSettingsPatch,
} from "../mappers/profile";
import type { MomentumClient } from "../types";

/**
 * Repository functions are plain functions over a user-scoped client. They
 * return domain types; nothing above @momentum/db ever sees a row. Ownership is
 * not re-checked here — row-level security is the authorization, and a second
 * permission model in the application layer would be a place for the two to
 * disagree (docs/ARCHITECTURE.md §4).
 */

/** The caller's profile, or null when there is none (a row hidden by RLS is indistinguishable from a missing one, by design). */
export async function getProfile(client: MomentumClient, userId: string): Promise<Profile | null> {
  const { data, error } = await client.from("profiles").select("*").eq("id", userId).maybeSingle();

  if (error) throw error;
  return data === null ? null : rowToProfile(data);
}

/**
 * Updates the settings a user owns. `xp`, `level` and `coins` are absent from
 * `ProfileSettingsPatch` and rejected by a database trigger even if a crafted
 * request includes them (Domain Rule 15).
 */
export async function updateProfileSettings(
  client: MomentumClient,
  userId: string,
  patch: ProfileSettingsPatch,
): Promise<Profile> {
  const { data, error } = await client
    .from("profiles")
    .update(profileSettingsToUpdate(patch))
    .eq("id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return rowToProfile(data);
}
