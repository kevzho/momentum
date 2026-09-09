"use client";

import * as React from "react";

import { Button } from "@momentum/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@momentum/ui/components/dialog";

// Focus starts on Cancel. On close it returns to the opener only while that
// is still mounted (the confirming control often deletes itself), otherwise to
// `fallbackFocus`, never to `<body>`.
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  confirmVariant = "destructive",
  onConfirm,
  fallbackFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  /** Archiving asks the same way but is not destructive. */
  confirmVariant?: "destructive" | "default";
  onConfirm: () => void;
  /** Where focus lands when the control that opened the dialog no longer exists. */
  fallbackFocus?: () => HTMLElement | null;
}) {
  const cancel = React.useRef<HTMLButtonElement>(null);
  const opener = React.useRef<HTMLElement | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-sm"
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          opener.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
          event.preventDefault();
          cancel.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const from = opener.current;
          opener.current = null;
          if (from !== null && from.isConnected) {
            from.focus();
            return;
          }
          const fallback = fallbackFocus?.() ?? null;
          if (fallback !== null && fallback.isConnected) fallback.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">{title}</DialogTitle>
          <DialogDescription className="text-xs">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            ref={cancel}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            size="sm"
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** What a delete takes with it. */
export interface DeleteCascade {
  subtasks: number;
  blocks: number;
}

/** "Its 2 subtasks and 3 work blocks are deleted too." `count` only changes the pronouns. */
export function describeDeleteCascade(count: number, cascade: DeleteCascade): string {
  const parts: string[] = [];
  if (cascade.subtasks > 0) {
    parts.push(`${cascade.subtasks} ${cascade.subtasks === 1 ? "subtask" : "subtasks"}`);
  }
  if (cascade.blocks > 0) {
    parts.push(`${cascade.blocks} work ${cascade.blocks === 1 ? "block" : "blocks"}`);
  }

  const total = cascade.subtasks + cascade.blocks;
  const cascades =
    parts.length === 0
      ? ""
      : `${count === 1 ? "Its" : "Their"} ${parts.join(" and ")} ${total === 1 ? "is" : "are"} deleted too. `;
  const keeps = count === 1 ? "a task without showing it" : "tasks without showing them";

  return `${cascades}This cannot be undone. Archiving keeps ${keeps}.`;
}
