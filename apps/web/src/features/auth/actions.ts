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

// Each action takes `FormData` so the forms work before JavaScript loads.

export type AuthResult = ActionResult<{ message: string | null }>;

const SIGNED_IN_HOME = "/today";

function safeNext(value: FormDataEntryValue | null) {
  return returnableRoute(typeof value === "string" ? value : null);
}

// `FormData.get()` reports an untouched input as `""`; for these optional
// fields that means absent, so a pre-hydration submit is not rejected.
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
    // One message for "no such account" and "wrong password": distinguishing
    // them would reveal which addresses are registered.
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
      // Read by handle_new_user() as raw_user_meta_data; an unrecognised
      // timezone becomes UTC rather than failing the signup.
      data: {
        ...(displayName ? { display_name: displayName } : {}),
        ...(timezone ? { timezone } : {}),
      },
      emailRedirectTo: `${env().NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });

  // A duplicate address must get the exact message a fresh sign-up gets, or
  // this screen becomes an account-existence oracle (requires email
  // confirmations enabled in production so a fresh sign-up also has no session).
  if (error) {
    if (error.code === "user_already_exists" || /already registered/i.test(error.message)) {
      return success({
        message: `Check ${email} for a link to confirm your account.`,
      });
    }
    return failure("validation", error.message);
  }

  // Email confirmation on: no session yet.
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
  // `supabase/templates/recovery.html` links with a `token_hash` rather than
  // the PKCE URL, since a reset link is opened in any browser; `redirectTo`
  // only matters for the default template.
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${env().NEXT_PUBLIC_APP_URL}/auth/callback?next=/update-password`,
  });

  // Same answer whether or not the address has an account (no enumeration).
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
  // nothing to update.
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
