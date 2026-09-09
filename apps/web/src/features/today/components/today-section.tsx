import * as React from "react";

import { cn } from "@momentum/ui/lib/utils";

/** One section of the Today page: an `h2` under the page's single `h1`, an optional count, and its rows. */
export function TodaySection({
  title,
  count,
  children,
  className,
  ...props
}: Omit<React.ComponentProps<"section">, "title"> & {
  title: React.ReactNode;
  count?: React.ReactNode;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-2", className)} {...props}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {title}
        </h2>
        {count === undefined ? null : (
          <span data-slot="numeric" className="text-xs text-muted-foreground">
            {count}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}
