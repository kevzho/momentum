"use server";

import { redirect } from "next/navigation";

import { env } from "@/lib/env";
import { failure, success, validationError, type ActionResult } from "@/lib/actions/result";
import { returnableRoute } from "@/lib/nav";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  requestPasswordResetInput,
  signInInput,
  signUpInput,
  updatePasswordInput,
} from "@/features/auth/schemas";

/**
 * Auth mutations.
 *
 * Each takes `FormData` so the forms work before JavaScript loads and keep
 * working if it fails; the client wrappers add `useActionState` on top for
 * pending state and inline errors. Every failure comes back as an
 * `ActionResult` — nothing throws for something a user can legitimately do
 * (docs/ARCHITECTURE.md §6).
 */

export type AuthResult = ActionResult<{ message: string | null }>;

/** Where an authenticated user lands. Kept here so every path agrees. */
const SIGNED_IN_HOME = "/today";

/** Only a route the app actually has is honoured; see `returnableRoute`. */
function safeNext(value: FormDataEntryValue | null) {
  return returnableRoute(typeof value === "string" ? value : null);
}

/**
 * An optional text field, read the way HTML means it.
 *
 * `FormData.get()` reports an untouched input as `""`, not as absent, and for
 * `displayName` and `timezone` those are the same thing: no suggestion. The
 * signup form's timezone input is empty until the client fills it from `Intl`,
 * so without this a form submitted before hydration — or in a browser where
 * `Intl` is unavailable — is rejected for a field the user never sees, instead
 * of starting the profile at UTC as the trigger intends
 * (docs/DATABASE.md § profiles).
 */
function optionalField(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export async function signIn(
  _previous: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const parsed = signInInput.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return validationError(parsed.error.issues);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Deliberately one message for "no such account" and "wrong password":
    // distinguishing them tells an attacker which addresses are registered.
    return failure("unauthenticated", "That email and password do not match an account.");
  }

  redirect(safeNext(formData.get("next")) ?? SIGNED_IN_HOME);
}

export async function signUp(
  _previous: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const parsed = signUpInput.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: optionalField(formData.get("displayName")),
    timezone: optionalField(formData.get("timezone")),
  });
  if (!parsed.success) return validationError(parsed.error.issues);

  const { email, password, displayName, timezone } = parsed.data;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Read by handle_new_user() as raw_user_meta_data. The timezone is a
      // suggestion the trigger validates; an unrecognised one becomes UTC
      // rather than failing the signup (docs/DATABASE.md § profiles).
      data: {
        ...(displayName ? { display_name: displayName } : {}),
        ...(timezone ? { timezone } : {}),
      },
      emailRedirectTo: `${env().NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });

  // A signed-up address that already exists must not be distinguishable from a
  // fresh one, or the sign-up screen becomes an account-existence oracle — the
  // same reason signIn and requestPasswordReset use one uniform message. GoTrue
  // answers a duplicate with `user_already_exists`; return the very message a new
  // account gets below. (With email confirmations enabled in production a fresh
  // sign-up also returns no session and this identical message, so the two are
  // indistinguishable; production must enable email confirmations — see the
  // Security audit section of docs/ROADMAP.md.)
  // Other errors — a weak password, an address GoTrue rejects — are the caller's
  // own input and are surfaced.
  if (error) {
    if (error.code === "user_already_exists" || /already registered/i.test(error.message)) {
      return success({
        message: `Check ${email} for a link to confirm your account.`,
      });
    }
    return failure("validation", error.message);
  }

  // Email confirmation on: no session yet, so say what happens next rather
  // than dropping the user on a sign-in screen with no explanation.
  if (!data.session) {
    return success({
      message: `Check ${email} for a link to confirm your account.`,
    });
  }

  redirect(SIGNED_IN_HOME);
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(
  _previous: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const parsed = requestPasswordResetInput.safeParse({ email: formData.get("email") });
  if (!parsed.success) return validationError(parsed.error.issues);

  const supabase = await createSupabaseServerClient();
  /*
   * The email itself is `supabase/templates/recovery.html`, which links to the
   * callback with a `token_hash` rather than the PKCE `{{ .ConfirmationURL }}`
   * — the PKCE code could only be exchanged by this browser, and a reset link
   * is opened wherever the email is read. `redirectTo` is kept for the
   * default template, and is a no-op with ours.
   */
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${env().NEXT_PUBLIC_APP_URL}/auth/callback?next=/update-password`,
  });

  // The same answer whether or not the address has an account: the response
  // must not be an account-enumeration oracle.
  return success({
    message: `If ${parsed.data.email} has an account, a reset link is on its way.`,
  });
}

export async function updatePassword(
  _previous: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const parsed = updatePasswordInput.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return validationError(parsed.error.issues);

  const supabase = await createSupabaseServerClient();

  // The recovery link signs the user in first; without that session there is
  // nothing to update, and saying so is more useful than a generic failure.
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return failure(
      "unauthenticated",
      "That reset link has expired. Request a new one and try again.",
    );
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return failure("validation", error.message);

  redirect(SIGNED_IN_HOME);
}
