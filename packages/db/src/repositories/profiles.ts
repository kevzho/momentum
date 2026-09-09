import type { Profile } from "@momentum/core/types";

import {
  profileSettingsToUpdate,
  rowToProfile,
  type ProfileSettingsPatch,
} from "../mappers/profile";
import type { MomentumClient } from "../types";

/** The caller's profile, or null. A row hidden by RLS is indistinguishable from a missing one, by design. */
export async function getProfile(client: MomentumClient, userId: string): Promise<Profile | null> {
  const { data, error } = await client.from("profiles").select("*").eq("id", userId).maybeSingle();

  if (error) throw error;
  return data === null ? null : rowToProfile(data);
}

/** `xp`, `level` and `coins` are absent from the patch and rejected by a database trigger. */
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
