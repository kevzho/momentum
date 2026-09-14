"use client";

import * as React from "react";
import Link from "next/link";
import { ArchiveIcon, ArchiveRestoreIcon, TimerIcon, TrashIcon } from "lucide-react";

import { coverageOf, formatCoverage } from "@momentum/core/tasks";
import { formatDuration } from "@momentum/core/time";
import type { LocalDate, Minutes, Task, TaskPriority, Uuid, Weekday } from "@momentum/core/types";

import { Button } from "@momentum/ui/components/button";
import { CoverageBar } from "@momentum/ui/components/coverage-bar";
import { DatePicker } from "@momentum/ui/components/date-picker";
import { DurationInput } from "@momentum/ui/components/duration-input";
import { Input } from "@momentum/ui/components/input";
import { Label } from "@momentum/ui/components/label";
import { PrioritySelect } from "@momentum/ui/components/priority-select";
import { Separator } from "@momentum/ui/components/separator";
import { SideSheet } from "@momentum/ui/components/side-sheet";
import { Textarea } from "@momentum/ui/components/textarea";

import { ProjectSelect } from "@/features/projects/components/project-select";
import {
  ConfirmDeleteDialog,
  describeDeleteCascade,
  type DeleteCascade,
} from "@/features/tasks/components/confirm-delete-dialog";
import { SubtaskList } from "@/features/tasks/components/subtask-list";
import { WorkBlockEditor } from "@/features/tasks/components/work-block-editor";
import type { BlockSpan } from "@/features/tasks/optimistic";
import type { ProjectSummary, TaskWorkBlock } from "@/features/tasks/types";
import type { ActionError } from "@/lib/actions/result";
import { useOpenerFocus } from "@/lib/use-opener-focus";

/** The length of a new work block when nothing else says. */
const FALLBACK_BLOCK_MINUTES: Minutes = 60;

// Every field saves on its own as it is committed (blur for text, change for
// pickers); there is no Save button. Due date and work blocks are deliberately
// separate sections with different labels.
export function TaskDetailSheet({
  task,
  subtasks,
  workBlocks,
  projects,
  today,
  weekStart,
  pending,
  pendingIds,
  failure = null,
  cascade,
  onOpenChange,
  onPatch,
  onToggleComplete,
  onDelete,
  onArchive,
  onUnarchive,
  onAddBlock,
  onUpdateBlock,
  onRemoveBlock,
  onAddSubtask,
  onMoveSubtask,
  onCreateProject,
}: {
  task: Task | null;
  subtasks: readonly Task[];
  workBlocks: readonly TaskWorkBlock[];
  projects: readonly ProjectSummary[];
  today: LocalDate;
  weekStart: Weekday;
  pending: boolean;
  pendingIds: ReadonlySet<Uuid>;
  /** The last refused write about this task, rendered next to the fields. */
  failure?: ActionError | null;
  /** What deleting this task takes with it; `undefined` reads as nothing. */
  cascade?: DeleteCascade;
  onOpenChange: (open: boolean) => void;
  onPatch: (id: Uuid, fields: Partial<Task>) => void;
  onToggleComplete: (id: Uuid, completed: boolean) => void;
  onDelete: (id: Uuid) => void;
  onArchive: (id: Uuid) => void;
  onUnarchive: (id: Uuid) => void;
  onAddBlock: (taskId: Uuid, span: BlockSpan) => void;
  onUpdateBlock: (taskId: Uuid, blockId: Uuid, span: BlockSpan) => void;
  onRemoveBlock: (taskId: Uuid, blockId: Uuid) => void;
  onAddSubtask: (parentId: Uuid, title: string) => void;
  onMoveSubtask: (id: Uuid, toIndex: number) => void;
  /** Opens the new-project dialog; `onCreated` receives the id once it is saved. */
  onCreateProject: (onCreated: (projectId: Uuid) => void) => void;
}) {
  const open = task !== null;
  const project = task?.projectId ? (projects.find((p) => p.id === task.projectId) ?? null) : null;

  const scheduled = workBlocks.reduce((total, block) => total + block.minutes, 0);
  const coverage = coverageOf(task?.estimatedMinutes ?? null, scheduled);
  const completed = task?.status === "completed";
  const archived = task?.status === "archived";

  // Opened from the URL, so there is no `Dialog.Trigger` for Radix to return
  // focus to. Given `open` so focus is restored in the closing commit rather
  // than after the exit animation.
  const openerFocus = useOpenerFocus(open);

  // Radix handles Escape at the document in the capture phase, before the
  // field's own handler; while a field is editing the sheet declines it.
  const editing = React.useRef(false);

  // Which delete is waiting for a yes: the task itself, or one of its subtasks.
  const [confirming, setConfirming] = React.useState<Task | null>(null);

  // Where focus goes after a subtask is deleted: its own Delete button went with it.
  const subtaskInput = React.useRef<HTMLInputElement>(null);

  /** Inert while a write is in flight, without the native attribute's blur. */
  function guarded(run: () => void): () => void {
    return () => {
      if (pending) return;
      run();
    };
  }

  return (
    <SideSheet
      open={open}
      onOpenChange={onOpenChange}
      onOpenAutoFocus={openerFocus.onOpenAutoFocus}
      onCloseAutoFocus={openerFocus.onCloseAutoFocus}
      onEscapeKeyDown={(event) => {
        if (editing.current) event.preventDefault();
      }}
      title={task?.title ?? ""}
      description={project ? project.name : "No project"}
      footer={
        task === null ? null : (
          // `aria-disabled` plus a guard, never native `disabled`: each button
          // raises the flag by being pressed, and the browser blurs a disabled element.
          <div className="flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-disabled={pending || undefined}
                className="aria-disabled:opacity-50"
                onClick={guarded(() => (archived ? onUnarchive(task.id) : onArchive(task.id)))}
              >
                {archived ? (
                  <ArchiveRestoreIcon aria-hidden="true" />
                ) : (
                  <ArchiveIcon aria-hidden="true" />
                )}
                {archived ? "Unarchive" : "Archive"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-disabled={pending || undefined}
                className="text-destructive hover:text-destructive aria-disabled:opacity-50"
                onClick={guarded(() => setConfirming(task))}
              >
                <TrashIcon aria-hidden="true" />
                Delete
              </Button>
            </div>

            <div className="flex gap-1.5">
              {/* A link, not a button: the session is started on `/focus` by a press. */}
              {completed || archived ? null : (
                <Button asChild type="button" size="sm" variant="outline">
                  <Link href={`/focus?task=${task.id}`}>
                    <TimerIcon aria-hidden="true" />
                    Start focus
                  </Link>
                </Button>
              )}

              {archived ? null : (
                <Button
                  type="button"
                  size="sm"
                  variant={completed ? "outline" : "default"}
                  aria-disabled={pending || undefined}
                  className="aria-disabled:opacity-50"
                  onClick={guarded(() => onToggleComplete(task.id, !completed))}
                >
                  {completed ? "Reopen task" : "Complete task"}
                </Button>
              )}
            </div>
          </div>
        )
      }
    >
      {task === null ? null : (
        // No field is disabled in flight: each commit is its own mutation, and
        // the browser would blur a field disabled the moment it was committed.
        <div className="flex flex-col gap-4">
          {/* Shown here because a toast behind a modal sheet is unreachable. */}
          {failure === null ? null : (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {failure.message}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-title">Title</Label>
            <CommittedInput
              id="task-title"
              value={task.title}
              invalid={failure?.fieldErrors?.title !== undefined}
              onEditingChange={(next) => {
                editing.current = next;
              }}
              onCommit={(title) => {
                if (title.trim() === "" || title === task.title) return;
                onPatch(task.id, { title });
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-notes">Notes</Label>
            <CommittedTextarea
              id="task-notes"
              value={task.description ?? ""}
              invalid={failure?.fieldErrors?.description !== undefined}
              onEditingChange={(next) => {
                editing.current = next;
              }}
              onCommit={(description) => {
                const next = description.trim() === "" ? null : description;
                if (next === task.description) return;
                onPatch(task.id, { description: next });
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-project">Project</Label>
              <ProjectSelect
                id="task-project"
                value={task.projectId}
                projects={projects}
                onValueChange={(projectId) => onPatch(task.id, { projectId })}
                onCreate={() => onCreateProject((projectId) => onPatch(task.id, { projectId }))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-priority">Priority</Label>
              <PrioritySelect
                id="task-priority"
                value={task.priority}
                onValueChange={(priority: TaskPriority) => onPatch(task.id, { priority })}
              />
            </div>

            {/* Due is a deadline: deliberately not next to the work blocks. */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-due">Due date</Label>
              <DatePicker
                id="task-due"
                value={task.dueDate}
                today={today}
                weekStart={weekStart}
                onValueChange={(dueDate) => onPatch(task.id, { dueDate })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-estimate">Estimate</Label>
              <DurationInput
                id="task-estimate"
                value={task.estimatedMinutes}
                onValueChange={(estimatedMinutes) => {
                  if (estimatedMinutes === task.estimatedMinutes) return;
                  onPatch(task.id, { estimatedMinutes });
                }}
              />
            </div>
          </div>

          <Separator />

          <section className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Coverage
              </h3>
              <span data-slot="numeric" className="text-xs">
                {formatCoverage(coverage)}
              </span>
            </div>
            <CoverageBar coverage={coverage} label={formatCoverage(coverage)} />
            <p className="text-xs text-muted-foreground">
              {coverage.state === "unestimated"
                ? "Add an estimate to see how much of this task still needs time."
                : coverage.state === "over"
                  ? `${formatDuration(coverage.overscheduledMinutes)} more scheduled than estimated.`
                  : coverage.remainingMinutes === 0
                    ? "Fully scheduled."
                    : `${formatDuration(coverage.remainingMinutes)} still to schedule.`}
            </p>
          </section>

          <Separator />

          <WorkBlockEditor
            blocks={workBlocks}
            today={today}
            weekStart={weekStart}
            defaultMinutes={
              coverage.remainingMinutes > 0 ? coverage.remainingMinutes : FALLBACK_BLOCK_MINUTES
            }
            disabled={pending}
            onAdd={(span) => onAddBlock(task.id, span)}
            onUpdate={(blockId, span) => onUpdateBlock(task.id, blockId, span)}
            onRemove={(blockId) => onRemoveBlock(task.id, blockId)}
          />

          <Separator />

          <SubtaskList
            subtasks={subtasks}
            disabled={pending}
            pendingIds={pendingIds}
            inputRef={subtaskInput}
            onAdd={(title) => onAddSubtask(task.id, title)}
            onToggle={onToggleComplete}
            onMove={onMoveSubtask}
            onDelete={(id) => setConfirming(subtasks.find((subtask) => subtask.id === id) ?? null)}
          />

          <ConfirmDeleteDialog
            open={confirming !== null}
            onOpenChange={(next) => {
              if (!next) setConfirming(null);
            }}
            title={`Delete “${confirming?.title ?? ""}”?`}
            description={
              confirming?.id === task.id
                ? describeDeleteCascade(1, cascade ?? { subtasks: 0, blocks: 0 })
                : "Any time reserved for it is deleted too. This cannot be undone."
            }
            confirmLabel="Delete"
            onConfirm={() => {
              if (confirming !== null) onDelete(confirming.id);
            }}
            fallbackFocus={() => subtaskInput.current}
          />
        </div>
      )}
    </SideSheet>
  );
}

// Commits on blur and Enter, not per keystroke (one server action per character).
function CommittedInput({
  id,
  value,
  invalid,
  onEditingChange,
  onCommit,
}: {
  id: string;
  value: string;
  invalid: boolean;
  onEditingChange: (editing: boolean) => void;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = React.useState(value);
  const [editing, setEditing] = React.useState(false);
  // Enter commits and keeps focus, so the blur that follows commits only what
  // changed after the Enter.
  const committed = React.useRef(value);

  function begin(): void {
    committed.current = value;
    setEditing(true);
    setDraft(value);
    onEditingChange(true);
  }

  function commit(next: string): void {
    if (next === committed.current) return;
    committed.current = next;
    onCommit(next);
  }

  return (
    <Input
      id={id}
      value={editing ? draft : value}
      aria-invalid={invalid || undefined}
      onFocus={begin}
      onChange={(event) => {
        setDraft(event.target.value);
        onEditingChange(true);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit(draft);
        }
        if (event.key === "Escape") {
          // Abandon the edit and stay in the field (a `blur()` would land on
          // `<body>`); the next Escape closes the sheet.
          setDraft(committed.current);
          onEditingChange(false);
        }
      }}
      onBlur={() => {
        setEditing(false);
        onEditingChange(false);
        commit(draft);
      }}
    />
  );
}

function CommittedTextarea({
  id,
  value,
  invalid,
  onEditingChange,
  onCommit,
}: {
  id: string;
  value: string;
  invalid: boolean;
  onEditingChange: (editing: boolean) => void;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = React.useState(value);
  const [editing, setEditing] = React.useState(false);

  return (
    <Textarea
      id={id}
      rows={3}
      value={editing ? draft : value}
      aria-invalid={invalid || undefined}
      placeholder="Anything worth remembering about this task"
      onFocus={() => {
        setEditing(true);
        setDraft(value);
        onEditingChange(true);
      }}
      onChange={(event) => {
        setDraft(event.target.value);
        onEditingChange(true);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        // Escape abandons the notes only; the sheet stays and so does focus.
        setDraft(value);
        onEditingChange(false);
      }}
      onBlur={() => {
        setEditing(false);
        onEditingChange(false);
        if (draft !== value) onCommit(draft);
      }}
    />
  );
}
