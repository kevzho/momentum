"use client";

import * as React from "react";
import { cn } from "cn";
import { FlagIcon } from "lucide-react";
import type { ProjectColor, TaskPriority } from "@momentum/core/types";

import { Checkbox } from "@momentum/ui/components/checkbox";
import { ProjectDot } from "@momentum/ui/components/project-dot";

// P4 means "no priority set" and shows nothing at all.
const PRIORITY_LABEL: Record<TaskPriority, string> = {
  1: "Priority 1",
  2: "Priority 2",
  3: "Priority 3",
  4: "No priority",
};

const PRIORITY_TONE: Record<TaskPriority, string> = {
  1: "text-destructive",
  2: "text-warning",
  3: "text-muted-foreground",
  4: "",
};

type DueTone = "default" | "due-soon" | "overdue";

const DUE_TONE: Record<DueTone, string> = {
  default: "text-muted-foreground",
  "due-soon": "text-warning",
  overdue: "text-destructive",
};

/** Every date and duration arrives pre-formatted; no date math here. */
function TaskRow({
  title,
  completed = false,
  priority = 4,
  project,
  due,
  dueTone = "default",
  estimate,
  coverage,
  onToggle,
  onSelect,
  selectLabel,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "title" | "onSelect" | "onToggle"> & {
  title: React.ReactNode;
  completed?: boolean;
  priority?: TaskPriority;
  project?: { name: string; color: ProjectColor } | null;
  due?: string | null;
  dueTone?: DueTone;
  estimate?: string | null;
  coverage?: string | null;
  onToggle?: (next: boolean) => void;
  onSelect?: () => void;
  selectLabel?: string;
}) {
  return (
    <div
      data-slot="task-row"
      data-completed={completed || undefined}
      className={cn(
        // Container query: the same row appears full-width and in a 384px column.
        "group @container flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors duration-fast ease-standard hover:bg-muted/60 has-focus-visible:bg-muted/60 pointer-coarse:min-h-10",
        className,
      )}
      {...props}
    >
      <Checkbox
        checked={completed}
        onCheckedChange={(next) => onToggle?.(next === true)}
        aria-label={completed ? `Mark "${title}" as open` : `Complete "${title}"`}
      />

      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 truncate rounded-md text-left text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span className={cn(completed && "text-muted-foreground line-through")}>{title}</span>
        {selectLabel ? <span className="sr-only"> — {selectLabel}</span> : null}
      </button>

      {/* Fixed-width meta columns so values line up down the list. */}
      <span className="hidden w-28 shrink-0 items-center gap-1.5 text-xs text-muted-foreground @md:flex">
        {project ? (
          <>
            <ProjectDot color={project.color} />
            <span className="truncate">{project.name}</span>
          </>
        ) : null}
      </span>

      <span
        data-slot="numeric"
        className="hidden w-16 shrink-0 text-right text-xs text-muted-foreground @lg:inline"
        title={coverage ?? undefined}
      >
        {estimate}
      </span>

      <span
        data-slot="numeric"
        className={cn("w-12 shrink-0 text-right text-xs", DUE_TONE[dueTone])}
      >
        {due}
      </span>

      <span className={cn("w-3.5 shrink-0", PRIORITY_TONE[priority])}>
        {priority === 4 ? null : (
          <>
            <FlagIcon className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{PRIORITY_LABEL[priority]}</span>
          </>
        )}
      </span>
    </div>
  );
}

export { TaskRow };
