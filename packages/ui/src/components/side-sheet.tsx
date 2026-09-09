"use client";

import * as React from "react";
import { cn } from "cn";

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@momentum/ui/components/sheet";

/**
 * The detail surface: task detail, block edit. A sheet rather than a dialog —
 * it does not interrupt the page it came from, it is 480px wide on desktop and
 * full width below `md`, and it always has a title for the accessibility tree.
 *
 * Use this instead of a modal wherever a modal is not genuinely required.
 */
function SideSheet({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
  className,
  ...props
}: Omit<React.ComponentProps<typeof SheetContent>, "title" | "side"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn("gap-0 sm:max-w-(--side-sheet-width)", className)}
        {...props}
      >
        <SheetHeader className="border-b">
          <SheetTitle className="text-sm font-semibold">{title}</SheetTitle>
          {description ? (
            <SheetDescription className="text-xs">{description}</SheetDescription>
          ) : (
            <SheetDescription className="sr-only">Details</SheetDescription>
          )}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer ? (
          <SheetFooter className="flex-row justify-end border-t">{footer}</SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export { SideSheet, SheetClose as SideSheetClose };
