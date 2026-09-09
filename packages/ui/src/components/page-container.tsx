import * as React from "react";
import { cn } from "cn";

/** The page gutter and rhythm. `fill` is for routes that own their own scrolling surface. */
function PageContainer({
  fill = false,
  className,
  ...props
}: React.ComponentProps<"div"> & { fill?: boolean }) {
  return (
    <div
      data-slot="page-container"
      className={cn(
        "flex flex-col gap-6 px-4 py-4 md:px-6 md:py-5",
        fill && "h-full min-h-0 gap-4 overflow-hidden",
        className,
      )}
      {...props}
    />
  );
}

export { PageContainer };
