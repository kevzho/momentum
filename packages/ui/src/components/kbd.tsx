import * as React from "react";
import { cn } from "cn";

/**
 * Keyboard hint glyph. Mono, `text-2xs`, one of the two places the mono family
 * is used at all.
 */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-muted px-1 font-mono text-2xs font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
