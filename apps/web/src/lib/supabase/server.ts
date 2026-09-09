import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@momentum/db";

import { env } from "@/lib/env";

/**
 * A request-scoped, user-scoped Supabase client built from the session
 * cookies; the user's JWT travels with every statement so row-level security
 * is the real authorization. Never cache or share this across requests.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env().NEXT_PUBLIC_SUPABASE_URL,
    env().NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      // Nothing in the browser reads the session cookie (v1 has no browser Supabase
      // client), so it is HttpOnly, and Secure in production.
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
            // Server components may not write cookies; `proxy.ts` refreshes the session
            // on every navigation and writes the rotated tokens there.
          }
        },
      },
    },
  );
}

export type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
