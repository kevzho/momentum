import * as React from "react";
import { cn } from "cn";

/**
 * The one page title.
 *
 * A page renders exactly one of these and nothing else renders its name at the
 * same time: the top bar shows the section name only on the widths where this
 * heading is visually hidden (docs/DESIGN_SYSTEM.md — duplicate headers are an
 * audit finding). The heading element stays in the accessibility tree at every
 * width so the document always has an `h1`.
 */
function PageHeader({
  title,
  description,
  actions,
  className,
  ...props
}: Omit<React.ComponentProps<"header">, "title"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header
      data-slot="page-header"
      className={cn("flex items-start justify-between gap-3 md:min-h-8", className)}
      {...props}
    >
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold tracking-tight max-md:sr-only">{title}</h1>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground max-md:sr-only">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </header>
  );
}

export { PageHeader };
