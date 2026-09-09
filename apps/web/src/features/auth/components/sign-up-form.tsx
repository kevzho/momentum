"use client";

import { useActionState, useSyncExternalStore } from "react";

import { Button } from "@momentum/ui/components/button";

import { signUp, type AuthResult } from "@/features/auth/actions";
import { FormField, FormMessage } from "@/features/auth/components/form-field";
import { useResultFocus } from "@/features/auth/components/use-result-focus";
import { PASSWORD_MIN_LENGTH } from "@/features/auth/schemas";

// One of the two sanctioned reads of the browser timezone (docs/ARCHITECTURE.md);
// it only seeds the new profile, which is the source of truth from then on.
const NEVER_CHANGES = () => () => {};

function readTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // Empty: the profile starts at UTC and Settings can correct it.
    return "";
  }
}

function useBrowserTimeZone(): string {
  // Empty server snapshot so server and first client render agree.
  return useSyncExternalStore(NEVER_CHANGES, readTimeZone, () => "");
}

export function SignUpForm() {
  const [state, formAction, pending] = useActionState<AuthResult | null, FormData>(signUp, null);
  const timezone = useBrowserTimeZone();
  const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined;
  const message = useResultFocus(state);

  if (state?.ok && state.data.message) {
    return (
      <FormMessage ref={message} tone="info">
        {state.data.message}
      </FormMessage>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="timezone" value={timezone} />

      {state && !state.ok ? (
        <FormMessage ref={message} tone="error">
          {state.error.message}
        </FormMessage>
      ) : null}

      <FormField
        name="displayName"
        label="Name (optional)"
        autoComplete="name"
        errors={fieldErrors?.displayName}
      />
      <FormField
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        errors={fieldErrors?.email}
      />
      <FormField
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
        errors={fieldErrors?.password}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
      />

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Creating your account…" : "Create account"}
      </Button>
    </form>
  );
}
