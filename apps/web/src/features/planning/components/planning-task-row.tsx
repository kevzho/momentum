"use client";

import * as React from "react";
import { useDraggable } from "@dnd-kit/core";
import { FlagIcon } from "lucide-react";

import { formatDuration, formatLocalDate } from "@momentum/core/time";
import type { Minutes, TaskPriority } from "@momentum/core/types";

import { ProjectDot } from "@momentum/ui/components/project-dot";
import { cn } from "@momentum/ui/lib/utils";

import { taskDraggableId, type TaskDragData } from "@/features/calendar/dnd";
import type { PlanTask } from "@/features/calendar/types";
import { DUE_PREFIX, coverageLabel, planTaskLabel } from "@/features/planning/copy";
import { taskBlockMinutes } from "@/features/planning/live";
import { focusFirstAvailable, tabbableNeighbours } from "@/lib/use-opener-focus";

/**
 * One task in the planning drawer: a dnd-kit drag source that is, first, a
 * button.
 *
 * Dragging is the accelerator. Activating the row (click, Enter, Space) or
 * pressing `F` opens Find Time; `S` opens the manual scheduling dialog. Those
 * are the keyboard routes Domain Rule 10 requires, which is why the keyboard
 * sensor's activator is deliberately not forwarded on Enter/Space: an
 * unscheduled task has no position on the board to move from, so a keyboard
 * drag would have nothing to say.
 *
 * The drag payload and the draggable id are unchanged from the Phase 3 panel,
 * so the grid's drop path keeps working without knowing the panel was
 * replaced.
 */

/** Priority is never colour alone: P1–P3 carry the flag glyph; P4 renders nothing, as `TaskRow` does. */
const PRIORITY_TONE: Record<TaskPriority, string> = {
  1: "text-destructive",
  2: "text-warning",
  3: "text-muted-foreground",
  4: "",
};

export interface PlanningTaskRowProps {
  task: PlanTask;
  /** Live coverage: the task's blocks on the board right now, plus what lies outside the range. */
  scheduledMinutes: Minutes;
  /** An optimistic schedule for this task is in flight; the row reads as settled. */
  pending: boolean;
  /** Open Find Time — the row's activation and its `F` key. */
  onFindTime: (task: PlanTask) => void;
  /** Open the manual scheduling dialog — the row's `S` key. */
  onSchedule: (task: PlanTask) => void;
}

export function PlanningTaskRow({
  task,
  scheduledMinutes,
  pending,
  onFindTime,
  onSchedule,
}: PlanningTaskRowProps) {
  // `satisfies` rather than a type annotation: dnd-kit types `data` as
  // `Record<string, any>`, and an interface has no implicit index signature, so
  // an annotated `TaskDragData` would not be assignable. The literal is still
  // checked against the payload contract in `dnd.ts`.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: taskDraggableId(task.id),
    data: {
      type: "task",
      taskId: task.id,
      title: task.title,
      durationMinutes: taskBlockMinutes(task),
    } satisfies TaskDragData,
    disabled: pending,
  });

  const nodeRef = React.useRef<HTMLButtonElement | null>(null);
  const attach = React.useCallback(
    (node: HTMLButtonElement | null) => {
      nodeRef.current = node;
      setNodeRef(node);
    },
    [setNodeRef],
  );

  /*
   * Scheduling an UNSCHEDULED row removes it from the list in the same frame
   * the block appears, and when that row is the focused one — it was just
   * used from the keyboard — the browser would drop focus on `<body>`. Hand
   * it to the next row instead (Domain Rule 10). A layout cleanup, because
   * that is the last moment the node is still in the document and still
   * focused; a passive one runs after both are gone.
   */
  React.useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    return () => {
      if (document.activeElement !== node) return;
      const { next, previous } = tabbableNeighbours(node);
      focusFirstAvailable([next, previous]);
    };
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    // A modified key is the browser's (⌘F is find-in-page), never the row's.
    const plain = !event.metaKey && !event.ctrlKey && !event.altKey;
    if (plain && (event.key === "f" || event.key === "F")) {
      event.preventDefault();
      if (!pending) onFindTime(task);
      return;
    }
    if (plain && (event.key === "s" || event.key === "S")) {
      event.preventDefault();
      if (!pending) onSchedule(task);
      return;
    }
    // Enter and Space activate the row as the button it is, and the click
    // handler opens Find Time. Handing them to the keyboard sensor instead
    // would start a drag that has no grid position to move.
    if (event.key === "Enter" || event.key === " ") return;
    listeners?.onKeyDown?.(event);
  }

  const coverage = coverageLabel(scheduledMinutes, task.estimatedMinutes);
  const hasMeta =
    task.priority !== 4 || task.projectName !== null || task.dueDate !== null || coverage !== null;

  return (
    <li>
      <button
        ref={attach}
        type="button"
        {...attributes}
        {...listeners}
        onKeyDown={handleKeyDown}
        onClick={() => {
          if (!pending) onFindTime(task);
        }}
        aria-label={planTaskLabel(task, scheduledMinutes)}
        aria-disabled={pending || undefined}
        data-pending={pending || undefined}
        className={cn(
          "flex w-full flex-col gap-0.5 rounded-md border border-dashed px-2 py-1.5 text-left transition-colors duration-fast ease-standard hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          pending && "opacity-60",
          isDragging && "opacity-40",
        )}
      >
        <span className="flex w-full items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
          {task.estimatedMinutes === null ? null : (
            <span data-slot="numeric" className="shrink-0 text-xs text-muted-foreground">
              {formatDuration(task.estimatedMinutes)}
            </span>
          )}
        </span>

        {hasMeta ? (
          <span
            aria-hidden="true"
            className="flex w-full items-center gap-1.5 text-2xs text-muted-foreground"
          >
            {task.priority === 4 ? null : (
              <FlagIcon className={cn("size-3 shrink-0", PRIORITY_TONE[task.priority])} />
            )}
            {task.projectColor === null ? null : (
              <ProjectDot color={task.projectColor} className="size-1.5" />
            )}
            {task.projectName === null ? null : (
              <span className="max-w-24 min-w-0 truncate">{task.projectName}</span>
            )}
            {task.dueDate === null ? null : (
              <span data-slot="numeric">
                {DUE_PREFIX} {formatLocalDate(task.dueDate, "monthDay")}
              </span>
            )}
            {coverage === null ? null : (
              <span data-slot="numeric" className="ml-auto">
                {coverage}
              </span>
            )}
          </span>
        ) : null}
      </button>
    </li>
  );
}
