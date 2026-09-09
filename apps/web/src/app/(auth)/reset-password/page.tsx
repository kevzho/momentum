import type { Metadata } from "next";

import { AuthCard, AuthLink } from "@/features/auth/components/auth-card";
import { RequestResetForm } from "@/features/auth/components/request-reset-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      description="We'll email you a link that signs you in so you can set a new one."
      footer={
        <span>
          Remembered it? <AuthLink href="/login">Sign in</AuthLink>
        </span>
      }
    >
      <RequestResetForm />
    </AuthCard>
  );
}
