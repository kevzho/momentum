"use client";

import * as React from "react";
import { unstable_rethrow, useRouter } from "next/navigation";

import { parseQuickAdd, type DismissedToken, type ParsedFieldKind } from "@momentum/core/parser";
import type { LocalDate, Task, TaskPriority, Uuid, Weekday } from "@momentum/core/types";

import { Button } from "@momentum/ui/components/button";
import { Chip } from "@momentum/ui/components/chip";
import { DatePicker } from "@momentum/ui/components/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@momentum/ui/components/dialog";
import { DurationInput } from "@momentum/ui/components/duration-input";
import { Input } from "@momentum/ui/components/input";
import { Kbd } from "@momentum/ui/components/kbd";
import { PrioritySelect } from "@momentum/ui/components/priority-select";
import { toast } from "@momentum/ui/components/toast";
import { cn } from "@momentum/ui/lib/utils";

import { useProjectManager } from "@/features/projects/components/project-manager";
import { ProjectSelect } from "@/features/projects/components/project-select";
import { createTask } from "@/features/tasks/actions";
import {
  QuickAddContext,
  type QuickAddContextValue,
  type QuickAddDefaults,
} from "@/features/tasks/components/quick-add-context";
import type { ProjectSummary } from "@/features/tasks/types";
import { failure, type ActionError, type ActionResult } from "@/lib/actions/result";
import { reportError } from "@/lib/report-error";
import { useOpenerFocus } from "@/lib/use-opener-focus";

// Quick Add, mounted once in the shell. The title runs through
// `@momentum/core/parser` on every keystroke; recognised tokens show as chips.
// Whichever of the chip or the control below most recently expressed the
// intent owns the value, and nothing the user typed is ever discarded.
// The handle (`useQuickAdd`) lives in `quick-add-context.ts`.
export {
  useQuickAdd,
  type QuickAddContextValue,
  type QuickAddDefaults,
} from "@/features/tasks/components/quick-add-context";

/** Mirrors `createTaskInput`. */
const TITLE_MAX_LENGTH = 500;

const DEFAULT_PLACEHOLDER = "What needs doing?";

export function QuickAddProvider({
  projects,
  today,
  weekStart,
  newTaskSortOrder = 0,
  children,
}: {
  projects: readonly ProjectSummary[];
  today: LocalDate;
  weekStart: Weekday;
  /** The `sortOrder` a capture is created with: one step below the user's lowest. */
  newTaskSortOrder?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [defaults, setDefaults] = React.useState<QuickAddDefaults>({});
  // Bumped on every opening and used as the dialog's `key`, so each opening
  // remounts with fresh state instead of resetting five `useState`s in an effect.
  const [session, setSession] = React.useState(0);
  // A title escaped from is offered back on the next opening; only Cancel and
  // adding the task discard it.
  const [draft, setDraft] = React.useState("");
  const pageDefaults = React.useRef<QuickAddDefaults>({});

  const value = React.useMemo<QuickAddContextValue>(
    () => ({
      open: (next = {}) => {
        setDefaults({ ...pageDefaults.current, ...next });
        setSession((current) => current + 1);
        setOpen(true);
      },
      setDefaults: (next) => {
        pageDefaults.current = next;
      },
    }),
    [],
  );

  // `Q` from anywhere, except while typing, with a modifier held, or with
  // another dialog open.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== "q" && event.key !== "Q") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, select, [contenteditable='true']") ||
        document.querySelector("[role='dialog'], [data-slot='sheet-content']")
      ) {
        return;
      }

      event.preventDefault();
      value.open();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [value]);

  return (
    <QuickAddContext value={value}>
      {children}
      <QuickAddDialog
        key={session}
        open={open}
        onOpenChange={setOpen}
        projects={projects}
        today={today}
        weekStart={weekStart}
        defaults={defaults}
        newTaskSortOrder={newTaskSortOrder}
        initialTitle={draft}
        onDismiss={setDraft}
      />
    </QuickAddContext>
  );
}

function QuickAddDialog({
  open,
  onOpenChange,
  projects,
  today,
  weekStart,
  defaults,
  newTaskSortOrder,
  initialTitle,
  onDismiss,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: readonly ProjectSummary[];
  today: LocalDate;
  weekStart: Weekday;
  defaults: QuickAddDefaults;
  newTaskSortOrder: number;
  /** A title escaped from last time, offered back. */
  initialTitle: string;
  /** The title to keep for next time; `""` when it was used or discarded. */
  onDismiss: (kept: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  // Opened programmatically, so there is no `Dialog.Trigger` for Radix to
  // return focus to.
  const openerFocus = useOpenerFocus();

  // Seeded at mount; the provider remounts this component on every opening.
  const [title, setTitle] = React.useState(initialTitle);
  const [projectId, setProjectId] = React.useState<Uuid | null>(defaults.projectId ?? null);
  const [priority, setPriority] = React.useState<TaskPriority | null>(null);
  const [dueDate, setDueDate] = React.useState<LocalDate | null>(defaults.dueDate ?? null);
  const [estimatedMinutes, setEstimatedMinutes] = React.useState<number | null>(null);
  // Tokens the user has taken back; the parser reads them as ordinary words.
  const [dismissed, setDismissed] = React.useState<readonly DismissedToken[]>([]);
  // Shown inside the dialog: a toast behind a modal is outside its focus trap.
  const [error, setError] = React.useState<(ActionError & { retry?: () => void }) | null>(null);

  // Runs once the create has settled, so `takeOver` (below) sees a parse that
  // already includes the manager's list.
  const manager = useProjectManager({
    projects,
    onCreated: (project) => takeOver("project", () => setProjectId(project.id)),
  });

  // A pure function of the string: no effect, no debounce, no state to drift.
  const parsed = React.useMemo(
    () => parseQuickAdd(title, { today, projects: manager.projects, dismissed }),
    [dismissed, manager.projects, title, today],
  );

  const effective = {
    projectId: parsed.projectId ?? projectId,
    priority: parsed.priority ?? priority ?? DEFAULT_PRIORITY,
    dueDate: parsed.dueDate ?? dueDate,
    estimatedMinutes: parsed.estimatedMinutes ?? estimatedMinutes,
  };

  const titleError =
    parsed.title.length > TITLE_MAX_LENGTH
      ? `Titles are at most ${TITLE_MAX_LENGTH} characters.`
      : (error?.fieldErrors?.title?.[0] ?? null);
  const canSubmit = !pending && parsed.title !== "" && titleError === null;
  // A failure that belongs to no field, or to a field the dialog does not show.
  const generalError =
    error === null || (error.code === "validation" && error.fieldErrors?.title !== undefined)
      ? null
      : error;

  // Closes and forgets the draft.
  function close(): void {
    onDismiss("");
    onOpenChange(false);
  }

  // Setting a control takes its field over from the text: the tokens filling
  // it are dismissed, returning their words to the title.
  function takeOver(kind: ParsedFieldKind, apply: () => void): void {
    const taken = parsed.tokens.filter((token) => token.kind === kind);
    if (taken.length > 0) setDismissed((current) => [...current, ...taken.map(asDismissed)]);
    apply();
  }

  // `id` defaults once per gesture, not per attempt, so Retry after a lost
  // response collides with the row that already committed instead of writing
  // a twin. No optimistic row: most routes have no task list to put one in.
  function submit(closeAfter: boolean, id: Uuid = crypto.randomUUID()): void {
    if (!canSubmit) return;
    setError(null);

    startTransition(async () => {
      let result: ActionResult<Task>;
      try {
        result = await createTask({
          id,
          title: parsed.title,
          projectId: effective.projectId,
          priority: effective.priority,
          dueDate: effective.dueDate,
          estimatedMinutes: effective.estimatedMinutes,
          description: null,
          parentTaskId: null,
          sortOrder: newTaskSortOrder,
        });
      } catch (thrown) {
        // A rejection inside the transition would reach the route's error
        // boundary, so it becomes a failed result. `unstable_rethrow` first:
        // `redirect()` and `notFound()` travel as thrown values.
        unstable_rethrow(thrown);
        reportError(thrown, { source: "quickAdd" });
        result = failure(
          "unavailable",
          "Momentum could not reach the server. Your change was not saved.",
        );
      }

      if (!result.ok) {
        // A validation failure carries no Retry: the same input cannot succeed twice.
        setError({
          ...result.error,
          ...(result.error.code === "validation" ? {} : { retry: () => submit(closeAfter, id) }),
        });
        return;
      }

      toast.success(`Added "${parsed.title}"`, {
        action: { label: "Open", onClick: () => router.push(`/tasks?task=${id}`) },
      });

      if (closeAfter) {
        close();
      } else {
        setTitle("");
        setDismissed([]);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Escape or a click outside keeps the title for the next opening.
        if (!next) onDismiss(title);
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="sm:max-w-lg"
        showCloseButton={false}
        onOpenAutoFocus={openerFocus.onOpenAutoFocus}
        onCloseAutoFocus={openerFocus.onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">New task</DialogTitle>
          <DialogDescription className="text-xs">
            A title is enough — or write the rest into it: “tomorrow”, “90m”, “p1”, “#project”.
            Press <Kbd>Enter</Kbd> to add it, <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> to add another.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {/* No `autoFocus`: React applies it before Radix's FocusScope runs,
              which then skips its mount event and leaves `useOpenerFocus` with
              nothing to return to. As the first tabbable node it is focused anyway. */}
          <Input
            value={title}
            // `readOnly`, never `disabled`: the browser blurs a disabled element,
            // and this is the element that pressed Enter.
            readOnly={pending}
            placeholder={defaults.placeholder ?? DEFAULT_PLACEHOLDER}
            aria-label="Task title"
            aria-invalid={titleError === null ? undefined : true}
            aria-describedby={titleError === null ? undefined : "quick-add-title-error"}
            className="h-9 text-base md:text-sm"
            onChange={(event) => {
              setTitle(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              submit(!event.shiftKey);
            }}
          />

          {titleError === null ? null : (
            <p id="quick-add-title-error" role="alert" className="-mt-1 text-xs text-destructive">
              {titleError}
            </p>
          )}

          {generalError === null ? null : (
            <div
              role="alert"
              className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <span>{generalError.message}</span>
              {generalError.retry === undefined ? null : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  aria-disabled={pending || undefined}
                  onClick={() => {
                    if (pending) return;
                    generalError.retry?.();
                  }}
                >
                  Retry
                </Button>
              )}
            </div>
          )}

          {/* Removing a chip returns its words to the title rather than deleting them. */}
          {parsed.tokens.length > 0 ? (
            <div
              role="group"
              aria-label="Understood from the title"
              className="-mt-1 flex flex-wrap items-center gap-1.5"
            >
              {parsed.tokens.map((token) => (
                <Chip
                  key={`${token.kind}:${token.start}`}
                  onRemove={() => setDismissed((current) => [...current, asDismissed(token)])}
                  removeLabel={`Remove ${token.label} and keep “${token.text}” in the title`}
                >
                  {token.label}
                </Chip>
              ))}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <ProjectSelect
              aria-label="Project"
              className="w-full"
              value={effective.projectId}
              projects={manager.projects}
              disabled={pending}
              onValueChange={(id) => takeOver("project", () => setProjectId(id))}
              onCreate={manager.createProject}
            />

            <PrioritySelect
              value={effective.priority}
              disabled={pending}
              onValueChange={(next) => takeOver("priority", () => setPriority(next))}
            />

            <DatePicker
              value={effective.dueDate}
              today={today}
              weekStart={weekStart}
              disabled={pending}
              onValueChange={(next) => takeOver("date", () => setDueDate(next))}
            />

            <DurationInput
              value={effective.estimatedMinutes}
              disabled={pending}
              placeholder="Estimate"
              aria-label="Estimate"
              onValueChange={(next) => takeOver("duration", () => setEstimatedMinutes(next))}
            />
          </div>

          {/* `aria-disabled` plus a guard, never native `disabled`: the browser
              would blur the button that started the write. */}
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-disabled={pending || undefined}
              onClick={() => {
                if (pending) return;
                close();
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              aria-disabled={!canSubmit || undefined}
              className={cn(!canSubmit && "opacity-50")}
              onClick={() => submit(true)}
            >
              Add task
            </Button>
          </div>
        </div>

        {manager.dialogs}
      </DialogContent>
    </Dialog>
  );
}

/** "No priority set", the schema's default. */
const DEFAULT_PRIORITY: TaskPriority = 4;

// Keyed by kind and text rather than position, so a dismissal survives edits
// to the front of the line.
function asDismissed(token: { kind: ParsedFieldKind; text: string }): DismissedToken {
  return { kind: token.kind, text: token.text };
}
