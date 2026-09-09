"use client";

import * as React from "react";
import { cn } from "@momentum/ui/lib/utils";
import {
  ArchiveRestoreIcon,
  CalendarClockIcon,
  FlagIcon,
  GripVerticalIcon,
  ListTreeIcon,
} from "lucide-react";
import { useDraggable, useDroppable } from "@dnd-kit/core";

import { formatCoverage, formatCoverageShort, type Coverage } from "@momentum/core/tasks";
import { formatLocalDate } from "@momentum/core/time";
import type { LocalDate, Task } from "@momentum/core/types";

import { Button } from "@momentum/ui/components/button";
import { Checkbox } from "@momentum/ui/components/checkbox";
import { ProjectDot } from "@momentum/ui/components/project-dot";

import type { ProjectSummary } from "@/features/tasks/types";

// Not built on `@momentum/ui`'s `TaskRow`: the root element here is the single
// tab stop, and wrapping would nest a control inside a control.
export interface TaskRowData {
  task: Task;
  project: ProjectSummary | null;
  coverage: Coverage;
  blockCount: number;
  subtaskCount: number;
  completedSubtaskCount: number;
}

const PRIORITY_TONE: Record<number, string> = {
  1: "text-destructive",
  2: "text-warning",
  3: "text-muted-foreground",
  4: "",
};

const PRIORITY_LABEL: Record<number, string> = {
  1: "Priority 1",
  2: "Priority 2",
  3: "Priority 3",
  4: "No priority",
};

export function TaskListRow({
  data,
  today,
  index,
  focused,
  selected,
  selectionActive,
  pending,
  onToggleComplete,
  onUnarchive,
  onOpen,
  onToggleSelected,
  onFocusRow,
  registerRef,
}: {
  data: TaskRowData;
  today: LocalDate;
  index: number;
  /** True for the one row holding the list's tab stop. */
  focused: boolean;
  selected: boolean;
  /** Any row is selected, so every row shows its checkbox column. */
  selectionActive: boolean;
  pending: boolean;
  onToggleComplete: (completed: boolean) => void;
  /** An archived row offers this in place of completion. */
  onUnarchive: () => void;
  onOpen: () => void;
  onToggleSelected: (additive: boolean) => void;
  onFocusRow: () => void;
  registerRef: (node: HTMLLIElement | null) => void;
}) {
  const { task, project, coverage, blockCount, subtaskCount, completedSubtaskCount } = data;
  const completed = task.status === "completed";
  const archived = task.status === "archived";

  // Destructured at the hook call: reading `draggable.setNodeRef` later would
  // be a ref access during render.
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `task:${task.id}`,
    data: { type: "task-row", taskId: task.id, index },
    disabled: completed || archived,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `task-slot:${task.id}`,
    data: { type: "task-slot", taskId: task.id, index },
  });

  const due = task.dueDate;
  const dueTone =
    due === null || completed
      ? "text-muted-foreground"
      : due < today
        ? "text-destructive"
        : due === today
          ? "text-warning"
          : "text-muted-foreground";

  const coverageShort = formatCoverageShort(coverage);

  return (
    <li
      ref={(node) => {
        registerRef(node);
        setDropRef(node);
      }}
      // Roving tab stop: one for the whole list.
      tabIndex={focused ? 0 : -1}
      // Deliberately not `role="option"` or a `button`: both are
      // children-presentational in ARIA and would hide the row's checkboxes.
      aria-labelledby={`task-title-${task.id}`}
      aria-describedby={selected ? `task-state-${task.id}` : undefined}
      data-task-id={task.id}
      data-selected={selected || undefined}
      data-over={isOver || undefined}
      onFocus={onFocusRow}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) {
          event.preventDefault();
          onToggleSelected(true);
          return;
        }
        onOpen();
      }}
      className={cn(
        "group @container flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 transition-colors duration-fast ease-standard outline-none",
        "hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
        selected && "bg-accent/60 hover:bg-accent/70",
        isOver && "border-t border-t-primary",
        pending && "opacity-60",
        // Opaque ground while dragging, or the title overprints the row beneath.
        isDragging && "bg-background shadow-md ring-1 ring-border hover:bg-background",
      )}
      style={
        transform ? { transform: `translate3d(0, ${transform.y}px, 0)`, zIndex: 1 } : undefined
      }
    >
      {/* Drag handle; the keyboard path is the list's Alt+↑/↓. */}
      <span
        {...listeners}
        {...attributes}
        ref={setNodeRef}
        aria-hidden="true"
        tabIndex={-1}
        className={cn(
          "-ml-1 flex size-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground/0 transition-colors duration-fast group-hover:text-muted-foreground/60",
          (completed || archived) && "invisible",
        )}
      >
        <GripVerticalIcon className="size-3.5" />
      </span>

      {/* Always visible on a coarse pointer, which has no hover or modifier-click. */}
      <span
        className={cn(
          "shrink-0",
          !selectionActive &&
            "opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100",
          selected && "opacity-100",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelected(true)}
          aria-label={selected ? `Deselect "${task.title}"` : `Select "${task.title}"`}
          className="border-muted-foreground/40"
        />
      </span>

      <span className="shrink-0" onClick={(event) => event.stopPropagation()}>
        {archived ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="-my-1 size-6"
            aria-disabled={pending || undefined}
            onClick={() => {
              if (pending) return;
              onUnarchive();
            }}
          >
            <ArchiveRestoreIcon className="size-3.5" aria-hidden="true" />
            <span className="sr-only">Unarchive &quot;{task.title}&quot;</span>
          </Button>
        ) : (
          <Checkbox
            checked={completed}
            aria-disabled={pending || undefined}
            onCheckedChange={(next) => {
              if (pending) return;
              onToggleComplete(next === true);
            }}
            aria-label={completed ? `Reopen "${task.title}"` : `Complete "${task.title}"`}
          />
        )}
      </span>

      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span
          id={`task-title-${task.id}`}
          className={cn(
            "truncate text-sm",
            completed && "text-muted-foreground line-through",
            archived && "text-muted-foreground",
          )}
        >
          {task.title}
        </span>

        {selected ? (
          <span id={`task-state-${task.id}`} className="sr-only">
            Selected
          </span>
        ) : null}

        {subtaskCount > 0 ? (
          <span
            className="flex shrink-0 items-center gap-0.5 text-2xs text-muted-foreground"
            title={`${completedSubtaskCount} of ${subtaskCount} subtasks done`}
          >
            <ListTreeIcon className="size-3" aria-hidden="true" />
            <span data-slot="numeric">
              {completedSubtaskCount}/{subtaskCount}
            </span>
            <span className="sr-only">subtasks complete</span>
          </span>
        ) : null}

        {blockCount > 0 ? (
          <span
            className="flex shrink-0 items-center gap-0.5 text-2xs text-muted-foreground"
            title={`${blockCount} work ${blockCount === 1 ? "block" : "blocks"} scheduled`}
          >
            <CalendarClockIcon className="size-3" aria-hidden="true" />
            <span data-slot="numeric">{blockCount}</span>
            <span className="sr-only">work {blockCount === 1 ? "block" : "blocks"} scheduled</span>
          </span>
        ) : null}
      </span>

      <span className="hidden w-28 shrink-0 items-center gap-1.5 text-xs text-muted-foreground @md:flex">
        {project ? (
          <>
            <ProjectDot color={project.color} />
            <span className="truncate">{project.name}</span>
          </>
        ) : null}
      </span>

      {/* Scheduled and Due are different concepts: two columns, never one string. */}
      <span
        data-slot="numeric"
        className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground @lg:inline"
        title={formatCoverage(coverage)}
      >
        {coverageShort}
      </span>

      <span data-slot="numeric" className={cn("w-12 shrink-0 text-right text-xs", dueTone)}>
        {due === null ? null : formatLocalDate(due, due === today ? "weekday" : "monthDay")}
      </span>

      <span className={cn("w-3.5 shrink-0", PRIORITY_TONE[task.priority])}>
        {task.priority === 4 ? null : (
          <>
            <FlagIcon className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{PRIORITY_LABEL[task.priority]}</span>
          </>
        )}
      </span>
    </li>
  );
}
