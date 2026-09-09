"use client";

import * as React from "react";
import Link from "next/link";
import { ArchiveIcon, TimerIcon, TrashIcon } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@momentum/ui/components/select";
import { Separator } from "@momentum/ui/components/separator";
import { SideSheet } from "@momentum/ui/components/side-sheet";
import { Textarea } from "@momentum/ui/components/textarea";

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

/** What a new work block is worth when nothing else says: an hour is a session. */
const FALLBACK_BLOCK_MINUTES: Minutes = 60;

const NO_PROJECT = "__none__";

/**
 * The detail surface: a side sheet, not a page and not a modal, so the list
 * behind it stays visible and in place.
 *
 * **Every field saves on its own, as it is committed** — on blur for the text
 * fields, on change for the pickers. There is no Save button, because a sheet
 * with one has two states the user has to keep track of, and closing it with
 * unsaved edits is a way to lose work. Each commit is one optimistic mutation
 * that rolls back on failure (Domain Rule 11).
 *
 * The layout says the two things this phase exists to say. **Due date and
 * scheduled time are in different sections with different labels** — "Due" is a
 * deadline in the fields grid, "Work blocks" is a list of reserved spans
 * (Domain Rule 1). And **coverage sits between them**, because the gap between
 * the estimate and what is booked is the number that makes the planner useful.
 */
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
  onAddBlock,
  onUpdateBlock,
  onRemoveBlock,
  onAddSubtask,
  onMoveSubtask,
}: {
  task: Task | null;
  subtasks: readonly Task[];
  workBlocks: readonly TaskWorkBlock[];
  projects: readonly ProjectSummary[];
  today: LocalDate;
  weekStart: Weekday;
  pending: boolean;
  pendingIds: ReadonlySet<Uuid>;
  /** The last refused write about this task, rendered next to the fields it rolled back. */
  failure?: ActionError | null;
  /** What deleting this task takes with it; `undefined` reads as nothing. */
  cascade?: DeleteCascade;
  onOpenChange: (open: boolean) => void;
  onPatch: (id: Uuid, fields: Partial<Task>) => void;
  onToggleComplete: (id: Uuid, completed: boolean) => void;
  onDelete: (id: Uuid) => void;
  onArchive: (id: Uuid) => void;
  onAddBlock: (taskId: Uuid, span: BlockSpan) => void;
  onUpdateBlock: (taskId: Uuid, blockId: Uuid, span: BlockSpan) => void;
  onRemoveBlock: (taskId: Uuid, blockId: Uuid) => void;
  onAddSubtask: (parentId: Uuid, title: string) => void;
  onMoveSubtask: (id: Uuid, toIndex: number) => void;
}) {
  const open = task !== null;
  const project = task?.projectId ? (projects.find((p) => p.id === task.projectId) ?? null) : null;

  const scheduled = workBlocks.reduce((total, block) => total + block.minutes, 0);
  const coverage = coverageOf(task?.estimatedMinutes ?? null, scheduled);
  const completed = task?.status === "completed";

  /*
   * The sheet opens from the URL — a row click, or Enter on the roving cursor —
   * so there is no `Dialog.Trigger` for Radix to return focus to, and its modal
   * content cancels the restore FocusScope would otherwise do. Without this the
   * user is dropped on `<body>` and the list's arrow keys stop working
   * (Domain Rule 10). Same helper the calendar's surfaces use; given `open`
   * so focus is restored in the commit that closes the sheet rather than
   * after its exit animation, and — when the row that opened it was deleted
   * or archived out of the list — lands on that row's tab-order neighbour.
   */
  const openerFocus = useOpenerFocus(open);

  /*
   * Whether a text field is mid-edit. Radix closes the sheet on Escape from
   * anywhere inside it, listening at the document in the capture phase — before
   * the field's own handler runs. The first Escape in a field means "abandon
   * this edit", not "close the sheet", so while a field is editing the sheet's
   * own Escape is declined and the field's handler takes it.
   */
  const editing = React.useRef(false);

  /*
   * Which delete is waiting for a yes: the task itself, or one of its subtasks.
   * Either cascades to work blocks, and there is no undo, so the button opens
   * a confirmation rather than writing (docs/DESIGN_SYSTEM.md).
   */
  const [confirming, setConfirming] = React.useState<Task | null>(null);

  /**
   * Where focus goes after a subtask is deleted from the confirmation: the
   * row's own Delete button went with the row, and the "Add a subtask" field
   * is the control that follows it.
   */
  const subtaskInput = React.useRef<HTMLInputElement>(null);

  /** Inert while a write is in flight, without the native attribute's blur (Domain Rule 10). */
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
          /*
           * Every button here is `aria-disabled` with a guard rather than
           * natively disabled while a write is in flight: each one raises the
           * flag by being pressed, and the browser blurs a natively disabled
           * element — dropping the keyboard user on `<body>` (Domain Rule 10).
           * The row wraps so the primary action stays on screen at 375px.
           */
          <div className="flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-disabled={pending || undefined}
                className="aria-disabled:opacity-50"
                onClick={guarded(() => onArchive(task.id))}
              >
                <ArchiveIcon aria-hidden="true" />
                Archive
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
              {/*
                One of the three routes into a focus session (Phase 7): from the
                task, from its calendar block, and — later — from the palette.
                It is a link, not a button, because it navigates: the session
                itself is started on `/focus`, by a press, so following this
                twice does not start two sessions.
              */}
              {completed ? null : (
                <Button asChild type="button" size="sm" variant="outline">
                  <Link href={`/focus?task=${task.id}`}>
                    <TimerIcon aria-hidden="true" />
                    Start focus
                  </Link>
                </Button>
              )}

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
            </div>
          </div>
        )
      }
    >
      {task === null ? null : (
        /*
         * No field is disabled while a write is in flight. Each commit is its
         * own optimistic mutation over one overlay, so editing a second field
         * while the first is saving is safe — and a field disabled the moment
         * it was committed is one the browser blurs, which is how Enter in
         * the title used to land a keyboard user on `<body>` (Domain Rule 10).
         */
        <div className="flex flex-col gap-4">
          {/*
            What the last write about this task was refused for, next to the
            fields it rolled back. The toast says it too, but this sheet is
            modal and a toast behind it is neither readable nor reachable
            from inside; the message here is what the server said about the
            field — "An estimate is at most one week." — not a paraphrase.
          */}
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
              <Select
                value={task.projectId ?? NO_PROJECT}
                onValueChange={(value) =>
                  onPatch(task.id, { projectId: value === NO_PROJECT ? null : value })
                }
              >
                <SelectTrigger id="task-project" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PROJECT}>No project</SelectItem>
                  {projects.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-priority">Priority</Label>
              <PrioritySelect
                id="task-priority"
                value={task.priority}
                onValueChange={(priority: TaskPriority) => onPatch(task.id, { priority })}
              />
            </div>

            {/* Due is a deadline. It sits with the other properties of the task,
                and deliberately not next to the work blocks (Domain Rule 1). */}
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

          {/* Scheduled versus estimated. The sentence and the bar say the same
              thing; the remaining figure is the one worth acting on. */}
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

/**
 * A text field that reports its value when the user is done with it, not on
 * every keystroke.
 *
 * Committing per keystroke would be one server action per character. Committing
 * on blur and on Enter is what a person means by "I have finished this field",
 * and it keeps the user's own text on screen while they type — the same rule
 * `DurationInput` follows.
 */
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
  /*
   * What has already been committed from this edit. Enter commits and keeps
   * the field focused — leaving it was never what Enter meant, and a blur
   * dropped a keyboard user on `<body>` — so the blur that eventually follows
   * commits only what changed after the Enter.
   */
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
          // Abandon the edit and stay in the field. A `blur()` here would drop
          // a keyboard user on `<body>` (Domain Rule 10); the draft goes back
          // to what was last committed, so the blur that eventually follows
          // has nothing to write. The sheet declined this Escape because the
          // field was editing when Radix asked; with nothing left to abandon
          // the next one closes the sheet, and Radix returns focus itself.
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
        // Escape abandons the notes, and only the notes — the sheet stays and
        // so does focus (a blur would land on `<body>`, Domain Rule 10).
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
