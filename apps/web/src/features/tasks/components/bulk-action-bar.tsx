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

// Every control here empties the selection, which unmounts the bar, so each
// hands focus to `returnFocusTo` before it removes itself.
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
  /** What deleting the selection takes with it. */
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

  // Whether the menu is closing because an item was chosen (which unmounts the
  // bar) rather than by Escape or a click away (where Radix's restore is right).
  const menuActed = React.useRef(false);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);

  function handOffFocus(): boolean {
    const target = returnFocusTo?.current ?? null;
    if (target === null || !target.isConnected) return false;
    target.focus();
    return true;
  }

  function act(run: () => void): void {
    run();
    // The unmount commits after this handler returns, so focus moved now stays put.
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
          // Cannot use `act`: an open menu traps focus, and Radix's restore aims
          // at a trigger inside the bar that has just unmounted.
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
