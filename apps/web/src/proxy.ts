import { type NextRequest, NextResponse } from "next/server";

import { refreshSession } from "@/lib/supabase/proxy";

/**
 * Runs before every rendered request: refreshes the Supabase session, then
 * redirects signed-out requests for app routes to /login and signed-in
 * requests for auth routes to /today. The redirect is an optimistic check that
 * saves a render; the real check is `requireSession()` in every query and
 * action, and row-level security beneath it. Never rely on this file alone
 * for authorization.
 */

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
    // Only the path travels; `returnableRoute` decides whether it is a route at all.
    if (pathname !== "/") {
      redirect.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(redirect, { headers: response.headers });
  }

  // /update-password is exempt: recovery signs the user in and then asks for a new password.
  if (userId && isPublicPath(pathname) && pathname !== "/update-password") {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/today";
    redirect.search = "";
    return NextResponse.redirect(redirect, { headers: response.headers });
  }

  return response;
}

export const config = {
  // The PWA entries are correctness, not optimisation: `manifest.webmanifest`
  // and `sw.js` are fetched without credentials and would otherwise 307 to
  // /login. `offline.html` exists for when there is no server to ask, and
  // `/version` is polled from the sign-in screen too.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|version$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
