import * as React from "react";
import { cn } from "cn";

/**
 * The locale is pinned, for the reason `@momentum/core/time` pins its own
 * (packages/core/src/time/format.ts): this bar is server-rendered into the top
 * bar on every authenticated route, and a bare `toLocaleString()` would group
 * the digits by the visitor's locale on the client and by the Node process's
 * on the server — a hydration mismatch for anyone whose separator is not the
 * comma. Built once at module scope; constructing an `Intl` formatter is the
 * expensive part.
 */
const XP_NUMBER = new Intl.NumberFormat("en-US");

/**
 * Compact level + progress for the top bar. The game layer is present, never
 * dominant: a number and a bar, no hero banner and no celebration (Domain
 * Rule 7, docs/DESIGN_SYSTEM.md § Gamification restraint).
 *
 * Values are display-only. XP is computed by trusted server logic; the client
 * never asserts an amount (Core invariant).
 */
function XPBar({
  level,
  xpIntoLevel,
  xpForNextLevel,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
}) {
  const fraction = xpForNextLevel <= 0 ? 0 : Math.min(Math.max(xpIntoLevel / xpForNextLevel, 0), 1);
  const remaining = Math.max(xpForNextLevel - xpIntoLevel, 0);

  return (
    <div
      data-slot="xp-bar"
      className={cn("flex items-center gap-2", className)}
      title={`${XP_NUMBER.format(remaining)} XP to level ${level + 1}`}
      {...props}
    >
      <span data-slot="numeric" className="text-xs font-medium">
        Lv {level}
      </span>
      <span
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={xpForNextLevel}
        aria-valuenow={xpIntoLevel}
        aria-label={`Level ${level} progress: ${XP_NUMBER.format(xpIntoLevel)} of ${XP_NUMBER.format(xpForNextLevel)} XP`}
        className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:block"
      >
        <span
          className="block h-full rounded-full bg-primary transition-[width] duration-base ease-standard"
          style={{ width: `${fraction * 100}%` }}
        />
      </span>
      <span data-slot="numeric" className="hidden text-xs text-muted-foreground lg:inline">
        {XP_NUMBER.format(xpIntoLevel)}/{XP_NUMBER.format(xpForNextLevel)}
      </span>
    </div>
  );
}

export { XPBar };
