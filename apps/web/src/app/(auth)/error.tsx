"use client";

import * as React from "react";
import { TriangleAlertIcon } from "lucide-react";

import { Button } from "@momentum/ui/components/button";
import { EmptyState } from "@momentum/ui/components/empty-state";

import { reportError } from "@/lib/report-error";

/**
 * The signed-out boundary.
 *
 * The `(app)` routes have had one since Phase 1; these did not, and Phase 12 is
 * where that became a hole worth closing. The four auth forms submit through
 * `useActionState`, which keeps them working before hydration — and which means
 * a *rejected* call (the device is offline, the server is unreachable) is
 * re-thrown into render rather than returned as an `AuthResult`. With no
 * boundary here, signing in with no connection replaced the page with
 * `global-error.tsx`: technically visible, but a full-document error screen for
 * a dropped Wi-Fi connection.
 *
 * Wrapping the actions in a client function would have caught it instead, at
 * the cost of the progressive enhancement those forms were built for. This
 * keeps both: the form still posts without JavaScript, and the failure lands
 * somewhere that says what happened and offers the retry.
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
