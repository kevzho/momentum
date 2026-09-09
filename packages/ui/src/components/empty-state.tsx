import * as React from "react";
import { cn } from "cn";

/** `compact` is for an empty section inside a page that has other content. */
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  titleAs: Title = "p",
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  icon: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
  /** `h1` when the empty state is the whole page (a 404), so the page has its heading. */
  titleAs?: "p" | "h1" | "h2";
}) {
  if (compact) {
    return (
      <div
        data-slot="empty-state"
        className={cn("flex items-center gap-2 px-2 py-1.5 text-sm", className)}
        {...props}
      >
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="shrink-0">{title}</span>
        {description ? (
          <span className="min-w-0 truncate text-xs text-muted-foreground">{description}</span>
        ) : null}
        {action ? <span className="ml-auto shrink-0">{action}</span> : null}
      </div>
    );
  }

  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-4 py-10 text-center",
        className,
      )}
      {...props}
    >
      <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="flex flex-col gap-1">
        <Title className="text-sm font-medium">{title}</Title>
        {description ? (
          <p className="max-w-xs text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export { EmptyState };
