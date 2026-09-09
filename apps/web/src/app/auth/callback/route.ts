import type { Route } from "next";
import { type NextRequest, NextResponse } from "next/server";

import { returnableRoute } from "@/lib/nav";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Supabase redirects the browser here from an email link, in one of two shapes:
 * `?code=…` (PKCE, exchanged for a session) or `?token_hash=…&type=…` (a
 * verification link needing no browser state). The recovery email deliberately
 * carries the second (`supabase/templates/recovery.html`): a PKCE code can
 * only be exchanged by the browser that asked, and reset links get opened on
 * phones and in private windows.
 */
/** A `type` outside this list is not one of ours. */
const EMAIL_OTP_TYPES = ["recovery", "email", "signup", "invite", "email_change"] as const;
type EmailOtpType = (typeof EMAIL_OTP_TYPES)[number];

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (EMAIL_OTP_TYPES as readonly string[]).includes(value);
}

// Not in `RETURNABLE_ROUTES`: the login screen reads that list too, and
// /update-password is never a place to return to.
const RECOVERY_DESTINATION = "/update-password" satisfies Route;

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  // `next` is whatever the email's sender wrote. Matched against the navigation
  // registry, never prefix-tested: the WHATWG parser folds `\` and C0 whitespace
  // into `/`, so `new URL("/\\evil.example", origin)` is `https://evil.example/`.
  const next = searchParams.get("next");
  const destination: Route =
    next === RECOVERY_DESTINATION ? RECOVERY_DESTINATION : (returnableRoute(next) ?? "/today");

  const supabase = await createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(destination, origin));
    // GoTrue says `bad_code_verifier` when the PKCE verifier cookie is absent:
    // this browser is not the one that asked. "Expired" would send the user to
    // request a link that fails the same way.
    if (isVerifierMismatch(error)) return failedWith("browser", origin);
  } else if (tokenHash && isEmailOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(destination, origin));
  }

  // An expired or already-used link; say so on the screen that can fix it.
  return failedWith("link", origin);
}

function failedWith(reason: "link" | "browser", origin: string): NextResponse {
  const failed = new URL("/login", origin);
  failed.searchParams.set("error", reason);
  return NextResponse.redirect(failed);
}

function isVerifierMismatch(error: { code?: string; message: string }): boolean {
  return error.code === "bad_code_verifier" || /code verifier/i.test(error.message);
}
