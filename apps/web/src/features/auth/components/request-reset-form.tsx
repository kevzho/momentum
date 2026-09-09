"use client";

import { useActionState } from "react";

import { Button } from "@momentum/ui/components/button";

import { requestPasswordReset, type AuthResult } from "@/features/auth/actions";
import { FormField, FormMessage } from "@/features/auth/components/form-field";
import { useResultFocus } from "@/features/auth/components/use-result-focus";

export function RequestResetForm() {
  const [state, formAction, pending] = useActionState<AuthResult | null, FormData>(
    requestPasswordReset,
    null,
  );
  const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined;
  const message = useResultFocus(state);

  // The confirmation is deliberately the same whether or not the address has
  // an account, so this screen cannot be used to discover who has one.
  if (state?.ok && state.data.message) {
    return (
      <FormMessage ref={message} tone="info">
        {state.data.message}
      </FormMessage>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state && !state.ok ? (
        <FormMessage ref={message} tone="error">
          {state.error.message}
        </FormMessage>
      ) : null}

      <FormField
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        errors={fieldErrors?.email}
      />

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
