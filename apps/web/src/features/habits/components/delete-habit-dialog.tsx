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

import { HABITS_COPY } from "@/features/habits/copy";
import type { HabitView } from "@/features/habits/types";
import { useOpenerFocus } from "@/lib/use-opener-focus";

/**
 * The one question before a habit is deleted.
 *
 * Deleting cascades: the habit, every day recorded for it and every block it
 * put on the calendar go together (Domain Rule 13), and there is no undo. A
 * menu item that did all of that on one press was the only destructive action
 * in the product without a second step. Archiving keeps everything, which is
 * why the dialog names it.
 *
 * Cancel is the default focus, so Enter does nothing irreversible, and Escape
 * cancels. On confirm the row the menu lived in is about to leave the list, so
 * the caller says where focus goes instead of the opener — the hand-off runs in
 * the close hook, the one moment after the dialog's own focus trap has let go
 * and before the browser has settled on `<body>` (Domain Rule 10).
 */
export interface DeleteHabitDialogProps {
  /** The habit to delete; `null` closes the dialog. */
  view: HabitView | null;
  /**
   * Runs the delete. Returns where focus goes once the dialog has closed,
   * because the row that opened it will not be there to return to.
   */
  onConfirm: (view: HabitView) => () => void;
  onClose: () => void;
}

export function DeleteHabitDialog({ view, onConfirm, onClose }: DeleteHabitDialogProps) {
  const openerFocus = useOpenerFocus();
  const cancelRef = React.useRef<HTMLButtonElement | null>(null);
  const handOff = React.useRef<(() => void) | null>(null);

  return (
    <Dialog
      open={view !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {view === null ? null : (
        <DialogContent
          onOpenAutoFocus={(event) => {
            openerFocus.onOpenAutoFocus(event);
            event.preventDefault();
            cancelRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            const after = handOff.current;
            handOff.current = null;
            if (after === null) {
              openerFocus.onCloseAutoFocus(event);
              return;
            }
            event.preventDefault();
            after();
          }}
        >
          <DialogHeader>
            <DialogTitle>Delete {view.habit.name}?</DialogTitle>
            <DialogDescription>{HABITS_COPY.deleteHint}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button ref={cancelRef} type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                handOff.current = onConfirm(view);
              }}
            >
              Delete habit
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
