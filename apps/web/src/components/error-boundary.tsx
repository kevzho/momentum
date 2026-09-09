"use client";

import * as React from "react";
import { TriangleAlertIcon } from "lucide-react";

import { Button } from "@momentum/ui/components/button";

import { reportError } from "@/lib/report-error";

/**
 * Section-level boundary: one failing panel must not blank the page around it
 * (docs/ARCHITECTURE.md §15). Route-level failures are handled by the
 * `error.tsx` files, which Next mounts for us; this is for the independent
 * panels inside a route.
 */
interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Names the failing region in the fallback: "Next up", "Plan". */
  section: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportError(error, { section: this.props.section, componentStack: info.componentStack });
  }

  private readonly retry = () => this.setState({ error: null });

  override render() {
    if (!this.state.error) return this.props.children;

    return <SectionErrorFallback section={this.props.section} onRetry={this.retry} />;
  }
}

export function SectionErrorFallback({
  section,
  onRetry,
}: {
  section: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-2 rounded-md border border-dashed p-4"
    >
      <span className="flex items-center gap-1.5 text-sm font-medium">
        <TriangleAlertIcon className="size-4 text-warning" aria-hidden="true" />
        {section} could not be loaded
      </span>
      <p className="text-xs text-muted-foreground">
        The rest of the page is unaffected. Try loading this section again.
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
