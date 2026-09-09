import * as React from "react";
import { cn } from "cn";
import { XIcon } from "lucide-react";

/** A removable token. Removal is a real button so it is reachable by keyboard. */
function Chip({
  children,
  onRemove,
  removeLabel,
  className,
  ...props
}: React.ComponentProps<"span"> & {
  onRemove?: () => void;
  removeLabel?: string;
}) {
  return (
    <span
      data-slot="chip"
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-md bg-muted px-2 text-xs text-foreground",
        className,
      )}
      {...props}
    >
      {children}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="-mr-1 inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <XIcon className="size-3" aria-hidden="true" />
          <span className="sr-only">{removeLabel ?? "Remove"}</span>
        </button>
      ) : null}
    </span>
  );
}

export { Chip };
