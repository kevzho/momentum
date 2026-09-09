"use client";

import * as React from "react";
import { TriangleAlertIcon } from "lucide-react";

import { Button } from "@momentum/ui/components/button";
import { EmptyState } from "@momentum/ui/components/empty-state";
import { PageContainer } from "@momentum/ui/components/page-container";

import { reportError } from "@/lib/report-error";

export default function CalendarError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => reportError(error, { boundary: "calendar" }), [error]);

  return (
    <PageContainer>
      <EmptyState
        icon={TriangleAlertIcon}
        title="Calendar could not be loaded"
        description="Nothing was lost. Reload this section, or move to another part of the app."
        action={
          <Button variant="outline" size="sm" onClick={reset}>
            Try again
          </Button>
        }
      />
    </PageContainer>
  );
}
