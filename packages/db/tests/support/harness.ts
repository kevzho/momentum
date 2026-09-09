import { execFileSync } from "node:child_process";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../src/database.types";

/**
 * Integration harness against a real local Supabase — the policies are the
 * thing under test. Suites skip themselves when MOMENTUM_DB_TESTS is unset.
 */

export const DB_TESTS_ENABLED = process.env.MOMENTUM_DB_TESTS === "1";

/** The two accounts `supabase/seed.sql` creates. */
export const SEED_USERS = {
  owner: { email: "demo@momentum.test", password: "momentum123" },
  neighbour: { email: "second@momentum.test", password: "momentum123" },
} as const;

interface LocalKeys {
  url: string;
  publishableKey: string;
  secretKey: string;
}

let cachedKeys: LocalKeys | undefined;

/** Local stack URL and keys: environment first, then `supabase status`. */
export function localKeys(): LocalKeys {
  if (cachedKeys) return cachedKeys;

  const envUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const envPublishable =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY;
  const envSecret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (envUrl && envPublishable && envSecret) {
    cachedKeys = { url: envUrl, publishableKey: envPublishable, secretKey: envSecret };
    return cachedKeys;
  }

  const status = execFileSync("supabase", ["status", "-o", "env"], { encoding: "utf8" });
  const values = new Map<string, string>();
  for (const line of status.split("\n")) {
    const match = /^([A-Z_]+)="?([^"]*)"?$/.exec(line.trim());
    if (match?.[1] && match[2]) values.set(match[1], match[2]);
  }

  const url = envUrl ?? values.get("API_URL");
  const publishableKey = envPublishable ?? values.get("ANON_KEY") ?? values.get("PUBLISHABLE_KEY");
  const secretKey = envSecret ?? values.get("SERVICE_ROLE_KEY") ?? values.get("SECRET_KEY");

  if (!url || !publishableKey || !secretKey) {
    throw new Error(
      "Could not resolve the local Supabase URL and keys. Run `supabase start`, or set " +
        "SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY.",
    );
  }

  cachedKeys = { url, publishableKey, secretKey };
  return cachedKeys;
}

export type TestClient = SupabaseClient<Database>;

function anonymousClient(): TestClient {
  const { url, publishableKey } = localKeys();
  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** A client carrying one seeded user's JWT, exactly as the browser would. */
export async function signIn(user: { email: string; password: string }): Promise<TestClient> {
  const client = anonymousClient();
  const { error } = await client.auth.signInWithPassword(user);
  if (error) {
    throw new Error(`Could not sign in as ${user.email}: ${error.message}. Run \`pnpm db:reset\`.`);
  }
  return client;
}

/**
 * Untyped client for the RLS sweep, which writes `{ [ownerColumn]: id }` across
 * a computed table name that the generated types correctly refuse. Every
 * specific assertion uses the typed one.
 */
export async function signInGeneric(user: {
  email: string;
  password: string;
}): Promise<SupabaseClient> {
  const { url, publishableKey } = localKeys();
  const client: SupabaseClient = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword(user);
  if (error) {
    throw new Error(`Could not sign in as ${user.email}: ${error.message}. Run \`pnpm db:reset\`.`);
  }
  return client;
}

/** The signed-out equivalent of `signInGeneric`. */
export function signedOutGenericClient(): SupabaseClient {
  const { url, publishableKey } = localKeys();
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Service-role client for fixtures only — never assert with it; it bypasses the policies under test. */
export function adminClient(): TestClient {
  const { url, secretKey } = localKeys();
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function userIdOf(client: TestClient): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Expected a signed-in client");
  return data.user.id;
}
