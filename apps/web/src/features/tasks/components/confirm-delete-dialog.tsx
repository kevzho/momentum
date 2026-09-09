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

/**
 * The one confirmation the task manager asks for: deleting.
 *
 * Deleting a task cascades to its subtasks and to every work block that pointed
 * at it (Domain Rule 13), and there is no undo — so the step between the button
 * and the write says what goes, in numbers, and defaults to not doing it.
 * Focus starts on Cancel; Escape and a click outside cancel; only the labelled
 * button deletes.
 *
 * Where focus goes afterwards is the part a modal opened by a control that
 * removes itself gets wrong. The confirming button is gone once the row or the
 * selection it belonged to is deleted, so the dialog returns to it only while
 * it is still there, and otherwise to the caller's `fallbackFocus` — never to
 * `<body>` (Domain Rule 10).
 */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  fallbackFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
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
          // The safe answer holds focus, not the destructive one.
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
            variant="destructive"
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

/** What a delete takes with it, for the confirmation to say in numbers. */
export interface DeleteCascade {
  subtasks: number;
  blocks: number;
}

/**
 * "Its 2 subtasks and 3 work blocks are deleted too." — or as much of that as
 * applies. `count` is how many tasks are being deleted, which changes the
 * pronouns and nothing else.
 */
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
