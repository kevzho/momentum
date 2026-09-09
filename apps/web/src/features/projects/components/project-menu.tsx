"use client";

import * as React from "react";
import { ArchiveIcon, MoreHorizontalIcon, PencilIcon } from "lucide-react";

import { Button } from "@momentum/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@momentum/ui/components/dropdown-menu";

import type { ProjectSummaryWithCount } from "@/features/tasks/types";

// The chosen action runs from `onCloseAutoFocus`, with focus back on the
// trigger, not from `onSelect` where the focused item is about to unmount —
// so a dialog opened from it records the trigger as its opener.
export function ProjectMenu({
  project,
  onRename,
  onArchive,
  className,
}: {
  project: ProjectSummaryWithCount;
  onRename: (project: ProjectSummaryWithCount) => void;
  onArchive: (project: ProjectSummaryWithCount) => void;
  className?: string;
}) {
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const chosen = React.useRef<(() => void) | null>(null);

  function choose(action: () => void): void {
    chosen.current = action;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button ref={triggerRef} size="icon-sm" variant="ghost" className={className}>
          <MoreHorizontalIcon aria-hidden="true" />
          <span className="sr-only">Options for {project.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-40"
        onCloseAutoFocus={(event) => {
          const action = chosen.current;
          chosen.current = null;
          if (action === null) return;
          event.preventDefault();
          triggerRef.current?.focus();
          action();
        }}
      >
        <DropdownMenuItem onSelect={() => choose(() => onRename(project))}>
          <PencilIcon aria-hidden="true" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => choose(() => onArchive(project))}>
          <ArchiveIcon aria-hidden="true" />
          Archive
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
