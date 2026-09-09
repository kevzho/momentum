import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import type { Database } from "@momentum/db";

import { env } from "@/lib/env";

/**
 * Refreshes the Supabase session for one request and returns the response the
 * rotated cookies were written to, together with the authenticated user.
 *
 * The response object is rebuilt whenever cookies are set so the refreshed
 * tokens reach both the incoming request (for the render that follows) and the
 * outgoing response (for the browser). Skipping either half is the classic
 * cause of random sign-outs.
 */
export async function refreshSession(request: NextRequest): Promise<{
  response: NextResponse;
  userId: string | null;
}> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env().NEXT_PUBLIC_SUPABASE_URL,
    env().NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      // See lib/supabase/server.ts: the session cookie is never read in the
      // browser, so HttpOnly (always) and Secure (production) cost nothing and
      // close the refresh-token-theft path a future XSS would otherwise open.
      cookieOptions: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet, headers) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          // Responses that set auth cookies must never be cached by a CDN.
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // getUser() (not getSession()) so the token is verified by the auth server
  // rather than trusted from the cookie.
  const { data } = await supabase.auth.getUser();

  return { response, userId: data.user?.id ?? null };
}
