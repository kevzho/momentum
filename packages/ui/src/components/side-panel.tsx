"use client";

import * as React from "react";
import { cn } from "cn";
import { PanelLeftIcon } from "lucide-react";

import { Button } from "@momentum/ui/components/button";

/**
 * A persistent column beside the content — the calendar's Plan panel. Not a
 * modal and not an overlay: it takes real layout space, collapses to nothing,
 * and is always in the tab order while open.
 *
 * Below `lg` it collapses out of the way; that width uses `SideSheet` instead.
 *
 * Closing unmounts the panel, and the close button is inside it, so the button
 * the user just pressed disappears from under the focus ring. This is not a
 * modal, so there is no Radix focus scope to restore anything: without
 * `returnFocusTo` the browser drops focus on `<body>` and a keyboard user
 * restarts from the top of the shell (Domain Rule 10). Callers pass a ref to
 * the control that re-opens the panel.
 */
function SidePanel({
  title,
  open,
  onOpenChange,
  side = "right",
  closeLabel = "Hide panel",
  returnFocusTo,
  children,
  footer,
  className,
  ...props
}: Omit<React.ComponentProps<"aside">, "title"> & {
  title: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: "left" | "right";
  closeLabel?: string;
  /** Where focus lands when the close button removes itself. */
  returnFocusTo?: React.RefObject<HTMLElement | null>;
  footer?: React.ReactNode;
}) {
  function close(): void {
    onOpenChange(false);
    // React commits the unmount only after this handler returns, so focus is
    // moved while the panel is still mounted and simply stays where it lands.
    const target = returnFocusTo?.current ?? null;
    if (target !== null && target.isConnected) target.focus();
  }

  if (!open) return null;

  return (
    <aside
      data-slot="side-panel"
      data-side={side}
      className={cn(
        "flex w-(--side-panel-width) shrink-0 flex-col bg-background",
        side === "right" ? "border-l" : "border-r",
        className,
      )}
      {...props}
    >
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b px-3">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {title}
        </span>
        <Button variant="ghost" size="icon-xs" onClick={close}>
          <PanelLeftIcon className={cn(side === "right" && "rotate-180")} aria-hidden="true" />
          <span className="sr-only">{closeLabel}</span>
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">{children}</div>
      {footer ? <div className="shrink-0 border-t p-3">{footer}</div> : null}
    </aside>
  );
}

export { SidePanel };
