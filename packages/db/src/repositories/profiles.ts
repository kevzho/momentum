import { nowInstant } from "@momentum/core/time";
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

/**
 * `xp`, `level` and `coins` are absent from the patch and rejected by a
 * database trigger. Saving working hours also stamps `working_hours_set_at`:
 * the first-run checklist reads that stamp, not the hours, because the
 * column default already looks like a choice.
 */
export async function updateProfileSettings(
  client: MomentumClient,
  userId: string,
  patch: ProfileSettingsPatch,
): Promise<Profile> {
  const update = profileSettingsToUpdate(patch);
  if (patch.workingHours !== undefined) update.working_hours_set_at = nowInstant();

  const { data, error } = await client
    .from("profiles")
    .update(update)
    .eq("id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return rowToProfile(data);
}

/** Ends the first-run checklist for good, whether it finished or was skipped. Idempotent. */
export async function dismissOnboarding(client: MomentumClient, userId: string): Promise<Profile> {
  const { data, error } = await client
    .from("profiles")
    .update({ onboarding_dismissed_at: nowInstant() })
    .eq("id", userId)
    .is("onboarding_dismissed_at", null)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (data !== null) return rowToProfile(data);

  // Already dismissed: the row was filtered out, not missing.
  const current = await getProfile(client, userId);
  if (current === null) throw new Error("Profile not found.");
  return current;
}
