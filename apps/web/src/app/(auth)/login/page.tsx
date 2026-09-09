import type { Metadata } from "next";

import { returnableRoute } from "@/lib/nav";

import { AuthCard, AuthLink } from "@/features/auth/components/auth-card";
import { FormMessage } from "@/features/auth/components/form-field";
import { SignInForm } from "@/features/auth/components/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  // `proxy.ts` sets `next` when it turns away a signed-out request, so signing
  // in returns the user to what they were reaching for.
  const target = returnableRoute(typeof next === "string" ? next : null);

  return (
    <AuthCard
      title="Sign in"
      description="Pick up where your week left off."
      footer={
        <div className="flex flex-col gap-1.5">
          <span>
            No account yet? <AuthLink href="/signup">Create one</AuthLink>
          </span>
          <span>
            Forgotten your password? <AuthLink href="/reset-password">Reset it</AuthLink>
          </span>
        </div>
      }
    >
      {error === "link" ? (
        <div className="mb-4">
          <FormMessage tone="error">
            That link has expired or was already used. Sign in, or request a new reset link.
          </FormMessage>
        </div>
      ) : null}
      {error === "browser" ? (
        <div className="mb-4">
          <FormMessage tone="error">
            That link only works in the browser that requested it. Open it there, or request a new
            reset link from this one.
          </FormMessage>
        </div>
      ) : null}
      <SignInForm next={target} />
    </AuthCard>
  );
}
