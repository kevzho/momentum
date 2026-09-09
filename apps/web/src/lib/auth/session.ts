import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import type { Profile } from "@momentum/core/types";

import { getProfileFor } from "@/features/auth/queries";
import { createSupabaseServerClient, type SupabaseServerClient } from "@/lib/supabase/server";

export interface Session {
  /** The request-scoped, user-scoped client. Pass it to repository functions. */
  supabase: SupabaseServerClient;
  userId: string;
  email: string | null;
  profile: Profile;
}

/**
 * The session for this request, or null.
 *
 * `cache()` makes it one lookup per request no matter how many queries and
 * actions ask for it, which matters because every one of them needs the
 * profile timezone (docs/ARCHITECTURE.md §10).
 *
 * `getUser()`, never `getSession()`: the former verifies the JWT with the auth
 * server, the latter trusts a cookie the browser could have edited.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const profile = await getProfileFor(supabase, data.user.id);
  // The signup trigger creates the profile, so a missing one means the account
  // is not usable. Treating it as "not signed in" sends the user somewhere
  // they can act, instead of rendering a shell with no settings.
  if (!profile) return null;

  return {
    supabase,
    userId: data.user.id,
    email: data.user.email ?? null,
    profile,
  };
});

/**
 * The session, or a redirect to /login. This — not `proxy.ts` — is the check
 * that matters; the proxy's redirect is an optimisation that saves a render
 * (docs/ARCHITECTURE.md §12).
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
