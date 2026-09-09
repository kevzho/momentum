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
 * Confirmation before a cascading, non-undoable delete. Cancel takes default
 * focus so Enter does nothing irreversible. On confirm the opener row is about
 * to unmount, so the caller's hand-off runs in `onCloseAutoFocus` — after the
 * focus trap lets go and before the browser settles on `<body>`.
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
