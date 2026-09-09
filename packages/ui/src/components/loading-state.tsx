import * as React from "react";
import { cn } from "cn";
import { LoaderIcon } from "lucide-react";

/** Inline pending indicator. Never a full-page spinner after first paint. */
function LoadingState({
  label = "Loading",
  className,
  ...props
}: React.ComponentProps<"div"> & { label?: string }) {
  return (
    <div
      data-slot="loading-state"
      role="status"
      className={cn(
        "flex items-center justify-center gap-1.5 py-3 text-xs text-muted-foreground",
        className,
      )}
      {...props}
    >
      <LoaderIcon className="size-3.5 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export { LoadingState };
