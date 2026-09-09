import type { Route } from "next";
import { type NextRequest, NextResponse } from "next/server";

import { returnableRoute } from "@/lib/nav";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The one route handler in the auth flow. Route handlers exist only for
 * non-RSC consumers (docs/ARCHITECTURE.md §6); this is one, because Supabase
 * redirects the browser here from an email link.
 *
 * Two shapes arrive depending on the email template:
 *
 *   ?code=…                     PKCE — exchange it for a session
 *   ?token_hash=…&type=recovery a verification link, no browser state needed
 *
 * Both end with the session cookies written to this response, which is why the
 * exchange has to happen in a handler that can set them.
 *
 * The recovery email deliberately carries the second shape
 * (`supabase/templates/recovery.html`). A PKCE code can only be exchanged by
 * the browser that asked for the reset — the verifier is a cookie there — and
 * a reset link is exactly the kind of link people open on their phone, in a
 * webmail tab, or in a private window. A `token_hash` verifies anywhere.
 */
/** The link types Momentum sends. A `type` outside this list is not one of ours. */
const EMAIL_OTP_TYPES = ["recovery", "email", "signup", "invite", "email_change"] as const;
type EmailOtpType = (typeof EMAIL_OTP_TYPES)[number];

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (EMAIL_OTP_TYPES as readonly string[]).includes(value);
}

/**
 * The one destination Momentum sends here that is not a navigation route
 * (`requestPasswordReset`). Named here rather than added to `RETURNABLE_ROUTES`,
 * because the login screen reads that list too and `proxy.ts` treats
 * /update-password as public, so it is never a place to *return* to.
 */
const RECOVERY_DESTINATION = "/update-password" satisfies Route;

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  // `next` arrives inside an email link, so it is whatever the sender wrote.
  // It is matched against the navigation registry, exactly as the login screen
  // matches it, and never prefix-tested: the WHATWG parser folds `\` and C0
  // whitespace into `/` before resolving, so `new URL("/\\evil.example", origin)`
  // is `https://evil.example/` and no test on the raw string can close that.
  const next = searchParams.get("next");
  const destination: Route =
    next === RECOVERY_DESTINATION ? RECOVERY_DESTINATION : (returnableRoute(next) ?? "/today");

  const supabase = await createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(destination, origin));
    /*
     * The code is fine; this browser is not the one that asked for it. GoTrue
     * says `bad_code_verifier` when the PKCE verifier cookie is absent, and
     * "expired or already used" would send the user off to request a link
     * that will fail the same way. Say what actually happened.
     */
    if (isVerifierMismatch(error)) return failedWith("browser", origin);
  } else if (tokenHash && isEmailOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(destination, origin));
  }

  // An expired or already-used link. Say so on the screen that can fix it
  // rather than rendering an error page with no way forward.
  return failedWith("link", origin);
}

/** Back to sign-in, which renders a message for each reason. */
function failedWith(reason: "link" | "browser", origin: string): NextResponse {
  const failed = new URL("/login", origin);
  failed.searchParams.set("error", reason);
  return NextResponse.redirect(failed);
}

function isVerifierMismatch(error: { code?: string; message: string }): boolean {
  return error.code === "bad_code_verifier" || /code verifier/i.test(error.message);
}
