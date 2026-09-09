"use client";

import * as React from "react";
import { cn } from "cn";

import type { Coverage } from "@momentum/core/tasks";

/**
 * Scheduled versus estimated, as a bar.
 *
 * "The gap between estimate and scheduled time is the number that makes the
 * planner useful" (specs/04-task-manager.md), so the bar's job is to make the
 * gap visible rather than to celebrate the fill. Over-scheduling is drawn as
 * its own segment rather than by letting the bar run past its track: a task
 * with 90 minutes booked against a 60-minute estimate has over-committed the
 * week, and a full bar would say the opposite.
 *
 * The state is carried by more than colour: every bar has a label beside it,
 * and the accessible name states both numbers.
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
  // The filled part never exceeds the track. What is over is drawn beside it,
  // out of the same 100%, so the two together are still one bar.
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
