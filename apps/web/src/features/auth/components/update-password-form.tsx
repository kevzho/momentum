"use client";

import { useActionState } from "react";

import { Button } from "@momentum/ui/components/button";

import { updatePassword, type AuthResult } from "@/features/auth/actions";
import { FormField, FormMessage } from "@/features/auth/components/form-field";
import { useResultFocus } from "@/features/auth/components/use-result-focus";
import { PASSWORD_MIN_LENGTH } from "@/features/auth/schemas";

export function UpdatePasswordForm() {
  const [state, formAction, pending] = useActionState<AuthResult | null, FormData>(
    updatePassword,
    null,
  );
  const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined;
  const message = useResultFocus(state);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state && !state.ok ? (
        <FormMessage ref={message} tone="error">
          {state.error.message}
        </FormMessage>
      ) : null}

      <FormField
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
        errors={fieldErrors?.password}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
      />
      <FormField
        name="confirmPassword"
        label="Repeat new password"
        type="password"
        autoComplete="new-password"
        required
        errors={fieldErrors?.confirmPassword}
      />

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Saving…" : "Save password"}
      </Button>
    </form>
  );
}
