"use client";

import * as React from "react";
import { TriangleAlertIcon } from "lucide-react";

import { Button } from "@momentum/ui/components/button";
import { EmptyState } from "@momentum/ui/components/empty-state";

import { reportError } from "@/lib/report-error";

/**
 * The auth forms submit through `useActionState` (so they work before
 * hydration), which re-throws a rejected call into render rather than
 * returning it. Without this boundary, signing in offline replaced the page
 * with `global-error.tsx`.
 */
export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => reportError(error, { boundary: "(auth)" }), [error]);

  return (
    <EmptyState
      icon={TriangleAlertIcon}
      title="Momentum could not be reached"
      description="Nothing was submitted. Check your connection and try again."
      action={
        <Button variant="outline" size="sm" onClick={reset}>
          Try again
        </Button>
      }
    />
  );
}
