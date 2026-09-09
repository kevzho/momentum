import * as React from "react";
import { cn } from "cn";

/** Label + one tabular number. Use sparingly. */
function StatTile({
  label,
  value,
  hint,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div data-slot="stat-tile" className={cn("flex flex-col gap-0.5", className)} {...props}>
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span data-slot="numeric" className="text-2xl font-semibold">
        {value}
      </span>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

export { StatTile };
