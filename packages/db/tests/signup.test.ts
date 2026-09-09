import { afterAll, describe, expect, it } from "vitest";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/database.types";
import { DB_TESTS_ENABLED, adminClient, localKeys } from "./support/harness";

/**
 * A trigger on `auth.users` creates the profile; the signup metadata's timezone
 * is kept only if Postgres recognises it.
 */

const describeDb = DB_TESTS_ENABLED ? describe : describe.skip;

const createdUserIds: string[] = [];

async function signUpFresh(metadata: Record<string, string>) {
  const { url, publishableKey } = localKeys();
  const client = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const email = `signup-${crypto.randomUUID()}@momentum.test`;
  const { data, error } = await client.auth.signUp({
    email,
    password: "momentum123",
    options: { data: metadata },
  });

  if (error) throw new Error(`Signup failed: ${error.message}`);
  if (data.user) createdUserIds.push(data.user.id);

  return { client, email, userId: data.user?.id };
}

describeDb("signup", () => {
  afterAll(async () => {
    const admin = adminClient();
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("creates a profile with the browser timezone the form sent", async () => {
    const { client, userId } = await signUpFresh({
      timezone: "Asia/Kolkata",
      display_name: "Priya Raman",
    });

    const { data, error } = await client.from("profiles").select("*").eq("id", userId!).single();

    expect(error).toBeNull();
    expect(data?.timezone).toBe("Asia/Kolkata");
    expect(data?.display_name).toBe("Priya Raman");
    expect(data?.week_start).toBe(1);
    expect(data?.snap_minutes).toBe(15);
    expect(data?.level).toBe(1);
    expect(data?.xp).toBe(0);
  });

  it("falls back to UTC when the timezone is not one Postgres knows", async () => {
    const { client, userId } = await signUpFresh({ timezone: "Mars/Olympus_Mons" });

    const { data } = await client.from("profiles").select("timezone").eq("id", userId!).single();

    // A bad timezone must never fail the signup.
    expect(data?.timezone).toBe("UTC");
  });

  it("names the account from the email when no display name is given", async () => {
    const { client, email, userId } = await signUpFresh({ timezone: "Europe/London" });

    const { data } = await client
      .from("profiles")
      .select("display_name")
      .eq("id", userId!)
      .single();

    expect(data?.display_name).toBe(email.split("@")[0]);
  });

  it("gives a brand-new account exactly one profile and nothing else", async () => {
    const { client, userId } = await signUpFresh({ timezone: "America/Denver" });

    const profiles = await client.from("profiles").select("id", { count: "exact", head: true });
    expect(profiles.count).toBe(1);

    for (const table of ["tasks", "projects", "calendar_blocks", "xp_events"] as const) {
      const { count } = await client.from(table).select("id", { count: "exact", head: true });
      expect(count, `${table} should be empty for a new account`).toBe(0);
    }

    expect(userId).toBeTruthy();
  });
});
