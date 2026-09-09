import * as React from "react";

/** One titled section of the drawer; every section declares an empty state. */
export function PlanningSection({
  title,
  empty,
  count,
  children,
}: {
  title: string;
  /** Rendered instead of `children` when `count` is zero. */
  empty: React.ReactNode;
  count: number;
  children: React.ReactNode;
}) {
  const headingId = React.useId();

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1">
      <h2
        id={headingId}
        className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        {title}
      </h2>
      {count === 0 ? empty : children}
    </section>
  );
}
