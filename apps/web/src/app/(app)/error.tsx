"use client";

import * as React from "react";
import { TriangleAlertIcon } from "lucide-react";

import { Button } from "@momentum/ui/components/button";
import { EmptyState } from "@momentum/ui/components/empty-state";
import { PageContainer } from "@momentum/ui/components/page-container";

import { reportError } from "@/lib/report-error";

/**
 * Content-area boundary: the sidebar and top bar survive, so the user can
 * navigate away instead of reloading a blank application.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => reportError(error, { boundary: "(app)" }), [error]);

  return (
    <PageContainer>
      <EmptyState
        icon={TriangleAlertIcon}
        title="This page could not be loaded"
        description="Nothing was lost. Try again, or move to another section from the sidebar."
        action={
          <Button variant="outline" size="sm" onClick={reset}>
            Try again
          </Button>
        }
      />
    </PageContainer>
  );
}
