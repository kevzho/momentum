"use client";

import { useActionState } from "react";

import { Button } from "@momentum/ui/components/button";

import { signIn, type AuthResult } from "@/features/auth/actions";
import { FormField, FormMessage } from "@/features/auth/components/form-field";
import { useResultFocus } from "@/features/auth/components/use-result-focus";

export function SignInForm({ next }: { next: string | null }) {
  const [state, formAction, pending] = useActionState<AuthResult | null, FormData>(signIn, null);
  const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined;
  const message = useResultFocus(state);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

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
      <FormField
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        errors={fieldErrors?.password}
      />

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
