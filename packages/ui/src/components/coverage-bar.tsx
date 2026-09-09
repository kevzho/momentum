"use client";

import * as React from "react";
import { cn } from "cn";

import type { Coverage } from "@momentum/core/tasks";

/**
 * Scheduled versus estimated. Over-scheduling is drawn as its own segment
 * inside the track, never by letting the bar run past it.
 */
const STATE_FILL: Record<Coverage["state"], string> = {
  unestimated: "bg-muted-foreground/40",
  unscheduled: "bg-muted-foreground/30",
  partial: "bg-primary",
  covered: "bg-success",
  over: "bg-warning",
};

function CoverageBar({
  coverage,
  label,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "role" | "aria-label"> & {
  coverage: Coverage;
  /** The sentence a screen reader hears; the visible label is rendered by the caller. */
  label: string;
}) {
  const ratio = coverage.ratio ?? 0;
  const filled = Math.min(1, ratio);
  const over = coverage.state === "over" ? Math.min(1, ratio - 1) : 0;

  return (
    <div
      role="img"
      aria-label={label}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
      {...props}
    >
      <div className="flex h-full w-full">
        <div
          className={cn(
            "h-full transition-[width] duration-fast ease-standard",
            STATE_FILL[coverage.state],
          )}
          style={{ width: `${filled * 100}%` }}
        />
        {over > 0 ? (
          <div
            className="h-full bg-warning/40 transition-[width] duration-fast ease-standard"
            style={{ width: `${over * 100}%` }}
          />
        ) : null}
      </div>
    </div>
  );
}

export { CoverageBar };
