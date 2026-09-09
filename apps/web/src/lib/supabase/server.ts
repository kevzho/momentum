import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@momentum/db";

import { env } from "@/lib/env";

/**
 * A request-scoped, user-scoped Supabase client built from the session
 * cookies. The user's JWT travels with every statement, so `auth.uid()`
 * resolves inside Postgres and row-level security is the real authorization
 * for each read and write (docs/ARCHITECTURE.md §4).
 *
 * Never cache or share this across requests: it carries one user's session.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env().NEXT_PUBLIC_SUPABASE_URL,
    env().NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      // The session cookie carries a rotating refresh token and nothing in the
      // browser ever reads it (v1 has no browser Supabase client — see
      // docs/ARCHITECTURE.md §4), so it is HttpOnly, and Secure in production.
      // Both harden it against theft by any future script injection without
      // changing behaviour, since only the server reads it.
      cookieOptions: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server components may not write cookies. This is expected and
            // harmless: `proxy.ts` refreshes the session on every navigation
            // and writes the rotated tokens there.
          }
        },
      },
    },
  );
}

export type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
