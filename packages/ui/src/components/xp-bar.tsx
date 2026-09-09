import * as React from "react";
import { cn } from "cn";

// Locale pinned: a bare `toLocaleString()` would differ between server and
// client and cause a hydration mismatch.
const XP_NUMBER = new Intl.NumberFormat("en-US");

/** Display-only: XP is computed server-side and the client never asserts an amount. */
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
