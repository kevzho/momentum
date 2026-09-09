import * as React from "react";

import { cn } from "@momentum/ui/lib/utils";

/**
 * One section of the Today page: a label, an optional count, and its rows.
 *
 * The page is five sections that have to read as one surface, so the heading
 * shape is declared once rather than repeated with small differences. The
 * heading is a real `h2` under the page's single `h1` (docs/DESIGN_SYSTEM.md —
 * one title per page); the count sits on the baseline beside it so a section
 * states its own size before it is read.
 */
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
