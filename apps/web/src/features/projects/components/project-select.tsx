"use client";

import * as React from "react";
import { FolderPlusIcon } from "lucide-react";

import type { Uuid } from "@momentum/core/types";

import { ProjectDot } from "@momentum/ui/components/project-dot";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@momentum/ui/components/select";
import { cn } from "@momentum/ui/lib/utils";

import type { ProjectSummary } from "@/features/tasks/types";

const NO_PROJECT = "__none__";
const NEW_PROJECT = "__new__";

/** The one project picker: Quick Add and the task sheet both use it. */
export function ProjectSelect({
  value,
  projects,
  onValueChange,
  onCreate,
  id,
  className,
  disabled,
  "aria-label": ariaLabel = "Project",
}: {
  value: Uuid | null;
  projects: readonly ProjectSummary[];
  onValueChange: (projectId: Uuid | null) => void;
  /** Opens the new-project dialog; the picker's value is untouched. */
  onCreate: () => void;
  id?: string;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  // "New project…" is an item, not a value: choosing it is noted here and acted
  // on from `onCloseAutoFocus`, with focus back on the trigger. The dialog it
  // opens records `document.activeElement` as its opener, and from
  // `onValueChange` that would be the item about to unmount.
  const createChosen = React.useRef(false);
  // Typeahead on the closed trigger also selects; focus is on the trigger
  // already then, and no close will follow to act on a note.
  const listOpen = React.useRef(false);

  return (
    <Select
      value={value ?? NO_PROJECT}
      disabled={disabled}
      onOpenChange={(open) => {
        listOpen.current = open;
      }}
      onValueChange={(next) => {
        if (next === NEW_PROJECT) {
          if (listOpen.current) createChosen.current = true;
          else onCreate();
          return;
        }
        onValueChange(next === NO_PROJECT ? null : next);
      }}
    >
      <SelectTrigger
        ref={triggerRef}
        id={id}
        className={cn("w-full", className)}
        aria-label={ariaLabel}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        // Radix runs this before its own trigger focus and skips that when
        // defaulted, so the trigger is focused here.
        onCloseAutoFocus={(event) => {
          if (!createChosen.current) return;
          createChosen.current = false;
          event.preventDefault();
          triggerRef.current?.focus({ preventScroll: true });
          onCreate();
        }}
      >
        <SelectItem value={NO_PROJECT}>No project</SelectItem>
        {projects.map((project) => (
          <SelectItem key={project.id} value={project.id}>
            <span className="flex items-center gap-2">
              <ProjectDot color={project.color} />
              {project.name}
            </span>
          </SelectItem>
        ))}
        <SelectSeparator />
        <SelectItem value={NEW_PROJECT}>
          <span className="flex items-center gap-2">
            <FolderPlusIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
            New project…
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
