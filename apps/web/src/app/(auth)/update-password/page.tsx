import type { Metadata } from "next";

import { AuthCard } from "@/features/auth/components/auth-card";
import { UpdatePasswordForm } from "@/features/auth/components/update-password-form";

export const metadata: Metadata = { title: "Set a new password" };

/**
 * Reached from the emailed reset link, which signs the user in first — so this
 * is the one public path `proxy.ts` still allows while authenticated.
 */
export default function UpdatePasswordPage() {
  return (
    <AuthCard
      title="Set a new password"
      description="You're signed in from the reset link. Choose a new password to finish."
    >
      <UpdatePasswordForm />
    </AuthCard>
  );
}
