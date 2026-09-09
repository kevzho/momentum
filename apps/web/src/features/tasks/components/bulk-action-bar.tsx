"use client";

import * as React from "react";
import { CheckIcon, FolderInputIcon, TrashIcon, XIcon } from "lucide-react";

import type { Uuid } from "@momentum/core/types";

import { Button } from "@momentum/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@momentum/ui/components/dropdown-menu";
import { Kbd } from "@momentum/ui/components/kbd";

import {
  ConfirmDeleteDialog,
  describeDeleteCascade,
  type DeleteCascade,
} from "@/features/tasks/components/confirm-delete-dialog";
import type { ProjectSummary } from "@/features/tasks/types";

/**
 * What a selection can do: complete, move to a project, delete.
 *
 * It appears in place above the list rather than floating over it, so it never
 * covers a row and never changes the list's scroll position — a floating bar
 * that hides the last selected task is a small betrayal of the selection it
 * represents.
 *
 * Every control here empties the selection, and an empty selection is what
 * unmounts the bar, so each of them removes itself as a direct result of being
 * pressed. This is not a modal, so there is no focus scope to restore anything:
 * without `returnFocusTo` the browser drops focus on `<body>` and a keyboard
 * user restarts from the top of the shell (Domain Rule 10). It is the same
 * contract, and the same guard, as `SidePanel`'s close button.
 */
export function BulkActionBar({
  selectedIds,
  allCompleted,
  projects,
  cascade,
  pending,
  returnFocusTo,
  onComplete,
  onMoveToProject,
  onDelete,
  onClear,
}: {
  selectedIds: ReadonlySet<Uuid>;
  /** Every selected task is already complete, so the button offers the reverse. */
  allCompleted: boolean;
  projects: readonly ProjectSummary[];
  /** What deleting the selection takes with it, for the confirmation to say. */
  cascade: DeleteCascade;
  pending: boolean;
  /** Where focus lands when an action clears the selection and takes the bar with it. */
  returnFocusTo?: React.RefObject<HTMLElement | null>;
  onComplete: (completed: boolean) => void;
  onMoveToProject: (projectId: Uuid | null) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const count = selectedIds.size;

  /*
   * Whether the menu is closing because an item was chosen, rather than because
   * the user pressed Escape or clicked away. Only the first case unmounts the
   * bar, and only it needs the handoff below; in the other two Radix's own
   * restore lands on a trigger that is still there and is exactly right.
   */
  const menuActed = React.useRef(false);
  /*
   * Delete is the one action that asks first. It is the only irreversible one
   * — completion reverses, a move re-moves — and it cascades to subtasks and
   * blocks the bar cannot show. The count and the cascade are in the dialog.
   */
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);

  /** Moves focus to the caller's anchor. Answers whether there was one to move to. */
  function handOffFocus(): boolean {
    const target = returnFocusTo?.current ?? null;
    if (target === null || !target.isConnected) return false;
    target.focus();
    return true;
  }

  function act(run: () => void): void {
    run();
    // React commits the unmount only after this handler returns, so focus is
    // moved while the bar is still mounted and simply stays where it lands.
    handOffFocus();
  }

  function moveToProject(projectId: Uuid | null): void {
    menuActed.current = true;
    onMoveToProject(projectId);
  }

  if (count === 0) return null;

  return (
    <div
      role="toolbar"
      aria-label={`${count} ${count === 1 ? "task" : "tasks"} selected`}
      className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-2 py-1.5"
    >
      <span className="text-sm font-medium">
        <span data-slot="numeric">{count}</span> selected
      </span>

      <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />

      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => act(() => onComplete(!allCompleted))}
      >
        <CheckIcon aria-hidden="true" />
        {allCompleted ? "Reopen" : "Complete"}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" disabled={pending}>
            <FolderInputIcon aria-hidden="true" />
            Move to project
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-52"
          /*
           * This path cannot use `act`. An open menu traps focus, so a move made
           * from inside `onSelect` is dragged straight back into the menu and
           * then lost when it closes; and Radix's own restore aims at the
           * trigger, which is inside the bar the chosen item has just unmounted.
           * The close hook is the moment that works — the same shape
           * `useOpenerFocus` uses for this feature's sheets — and the restore is
           * only cancelled when there is somewhere better to put focus.
           */
          onCloseAutoFocus={(event) => {
            if (!menuActed.current) return;
            menuActed.current = false;
            if (handOffFocus()) event.preventDefault();
          }}
        >
          <DropdownMenuItem onSelect={() => moveToProject(null)}>No project</DropdownMenuItem>
          {projects.length > 0 ? <DropdownMenuSeparator /> : null}
          {projects.map((project) => (
            <DropdownMenuItem key={project.id} onSelect={() => moveToProject(project.id)}>
              {project.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        className="text-destructive hover:text-destructive"
        onClick={() => setConfirmingDelete(true)}
      >
        <TrashIcon aria-hidden="true" />
        Delete
      </Button>

      <ConfirmDeleteDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={`Delete ${count} ${count === 1 ? "task" : "tasks"}?`}
        description={describeDeleteCascade(count, cascade)}
        confirmLabel={`Delete ${count} ${count === 1 ? "task" : "tasks"}`}
        onConfirm={() => act(onDelete)}
        fallbackFocus={() => returnFocusTo?.current ?? null}
      />

      <div className="ml-auto flex items-center gap-2">
        <span className="hidden text-2xs text-muted-foreground sm:inline">
          <Kbd>Esc</Kbd> to clear
        </span>
        <Button size="icon-sm" variant="ghost" onClick={() => act(onClear)}>
          <XIcon aria-hidden="true" />
          <span className="sr-only">Clear selection</span>
        </Button>
      </div>
    </div>
  );
}
