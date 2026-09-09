import type { Metadata } from "next";

import { AuthCard, AuthLink } from "@/features/auth/components/auth-card";
import { SignUpForm } from "@/features/auth/components/sign-up-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <AuthCard
      title="Create your account"
      description="One week, one board, everything competing for the same hours."
      footer={
        <span>
          Already have an account? <AuthLink href="/login">Sign in</AuthLink>
        </span>
      }
    >
      <SignUpForm />
    </AuthCard>
  );
}
