import * as React from "react";
import { cn } from "cn";

/**
 * The page gutter and vertical rhythm, in one place: `px-4` on mobile, `px-6`
 * on desktop, `gap-6` between sections (docs/DESIGN_SYSTEM.md § Spacing). Pages
 * compose this instead of repeating padding, so no route drifts.
 *
 * `fill` is for routes that own their own scrolling surface — the calendar
 * grid — where the page must be exactly the height of the content area.
 */
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
