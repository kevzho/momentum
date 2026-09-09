import { type NextRequest, NextResponse } from "next/server";

import { refreshSession } from "@/lib/supabase/proxy";

/**
 * Runs before every rendered request (Node runtime — see apps/web/AGENTS.md:
 * this file replaces the old `middleware.ts`).
 *
 * Two jobs, in order:
 *
 * 1. Refresh the Supabase session so a long-lived tab keeps working and the
 *    rotated tokens are written back to the browser.
 * 2. Redirect unauthenticated requests for application routes to /login, and
 *    signed-in requests for the auth routes to /today.
 *
 * The redirect is an *optimistic* check that saves a render. The real check is
 * `requireSession()` in every query and action, and beneath that row-level
 * security in Postgres (docs/ARCHITECTURE.md §12). Never rely on this file
 * alone for authorization.
 */

/** Routes a signed-out visitor may reach. Everything else requires a session. */
const PUBLIC_PATHS = ["/login", "/signup", "/reset-password", "/update-password"] as const;

/** The password-recovery link lands here; it must work while signed out. */
const AUTH_CALLBACK = "/auth/callback";

function isPublicPath(pathname: string): boolean {
  return (
    pathname === AUTH_CALLBACK ||
    PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
  );
}

export async function proxy(request: NextRequest) {
  const { response, userId } = await refreshSession(request);
  const { pathname } = request.nextUrl;

  if (!userId && !isPublicPath(pathname)) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.search = "";
    // Come back to where they were heading once they are signed in. Only the
    // path travels; `returnableRoute` decides whether it is a route at all.
    if (pathname !== "/") {
      redirect.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(redirect, { headers: response.headers });
  }

  // A signed-in user has no business on the sign-in screens. /update-password
  // is exempt: recovery signs the user in and *then* asks for a new password.
  if (userId && isPublicPath(pathname) && pathname !== "/update-password") {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/today";
    redirect.search = "";
    return NextResponse.redirect(redirect, { headers: response.headers });
  }

  return response;
}

export const config = {
  /**
   * Everything except Next's own assets and static files. Without the negative
   * match the session refresh would run for every CSS and image request.
   *
   * The three PWA entries are not an optimisation, they are correctness. A
   * browser fetches `manifest.webmanifest` and `sw.js` **without credentials**,
   * so to this file they look like signed-out traffic for a private route, and
   * the redirect below would answer both with a 307 to /login: the manifest
   * would fail to parse, the app would not be installable, and registration
   * would fail with a script of the wrong MIME type. `offline.html` is exempt
   * for the plainer reason that it exists to be shown when there is no server
   * to ask about a session, and `/version` because the sign-in screen polls it
   * for a new build exactly as the application does.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|version$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
