"use client";

import * as React from "react";
import { cn } from "cn";

import { useReducedMotion } from "@momentum/ui/hooks/use-reduced-motion";

/**
 * "+12 XP", and what it was for.
 *
 * The smallest piece of feedback in the product, and deliberately so: finishing
 * something moves a number the user cares about, and that is the whole of it.
 * No confetti, no sound, no full-width banner — those are reserved for a level
 * up, an achievement and a weekly goal (docs/DESIGN_SYSTEM.md § Gamification
 * restraint).
 *
 * The value is display-only. XP is computed by trusted server logic and read
 * back from the ledger; nothing here asserts an amount (Domain Rule 6).
 */
function XPToast({
  amount,
  reason,
  className,
  ...props
}: React.ComponentProps<"div"> & { amount: number; reason?: string }) {
  const reduced = useReducedMotion();

  return (
    <div
      data-slot="xp-toast"
      className={cn(
        "cn-toast flex items-center gap-2 rounded-(--radius) border bg-popover px-3 py-2 text-sm text-popover-foreground",
        className,
      )}
      {...props}
    >
      <span
        data-slot="numeric"
        className={cn(
          "shrink-0 font-semibold text-primary tabular-nums",
          !reduced && "animate-in duration-base fade-in slide-in-from-bottom-1",
        )}
      >
        +{amount} XP
      </span>
      {reason ? <span className="min-w-0 truncate text-muted-foreground">{reason}</span> : null}
    </div>
  );
}

export { XPToast };
