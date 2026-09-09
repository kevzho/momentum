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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@momentum/ui/components/select";
import { toast } from "@momentum/ui/components/toast";
import { cn } from "@momentum/ui/lib/utils";

import { createTask } from "@/features/tasks/actions";
import type { ProjectSummary } from "@/features/tasks/types";
import { failure, type ActionError, type ActionResult } from "@/lib/actions/result";
import { reportError } from "@/lib/report-error";
import { useOpenerFocus } from "@/lib/use-opener-focus";

const NO_PROJECT = "__none__";

/**
 * Quick Add. The most-used interaction in the product, so the budget is
 * keystrokes rather than features.
 *
 * **Two interactions from anywhere in the app**: `Q` (or the top bar's `+`)
 * opens it with the title field focused, and typing a title then pressing Enter
 * creates the task. Everything else — project, priority, date, duration — is
 * reachable without leaving the keyboard and is entirely optional.
 *
 * It is mounted once, in the shell, so it is the same two keystrokes on the
 * calendar, on Today and on Settings. It is a `Dialog` and not a `SideSheet`
 * because it is a transient capture, not a surface to work in — the one place
 * in the product where interrupting is the point.
 *
 * **Natural-language capture (Phase 11).** The title is a single free-text
 * input whose value runs through `@momentum/core/parser` on every keystroke —
 * a pure function, so typing is never waiting on it and a line it cannot read
 * costs nothing but a title that keeps every word of itself.
 *
 * What the parser recognised shows as removable chips under the field. One rule
 * governs the field and the chip together: **whichever of the two most recently
 * expressed the intent owns the value.** A chip is the text saying it, so while
 * the chip is there the control below merely displays it; setting that control
 * takes the value over and hands the words back to the title, and removing the
 * chip does the same and clears the field. Either way nothing the user typed
 * disappears, and no field ever has two owners.
 */
export interface QuickAddContextValue {
  open: (defaults?: QuickAddDefaults) => void;
  /**
   * What the page underneath would seed a capture with. A project view sets
   * its project here so `Q` and the page's own "New task" button open the same
   * dialog with the same values; the page clears it when it leaves. Values
   * passed to `open` win over these.
   */
  setDefaults: (defaults: QuickAddDefaults) => void;
}

export interface QuickAddDefaults {
  projectId?: Uuid | null;
  dueDate?: LocalDate | null;
}

const QuickAddContext = React.createContext<QuickAddContextValue | null>(null);

/** `openQuickAdd()` — a no-op outside the shell, never a thrown error. */
export function useQuickAdd(): QuickAddContextValue {
  return React.useContext(QuickAddContext) ?? { open: noop, setDefaults: noop };
}

function noop() {}

/**
 * The title's bound, mirrored from `createTaskInput` so an over-long paste is
 * refused here, on the field, before it is sent to be refused by the schema.
 */
const TITLE_MAX_LENGTH = 500;

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
  /**
   * The `sortOrder` a capture is created with: one step below the user's
   * lowest, so the new task is the first row of the Inbox rather than one more
   * row tied at `0` (`sortOrderBefore` in `@momentum/core/tasks`, computed by
   * the shell's read).
   */
  newTaskSortOrder?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [defaults, setDefaults] = React.useState<QuickAddDefaults>({});
  /*
   * Bumped on every opening and used as the dialog's `key`, so each opening
   * gets a fresh component with fresh state. That is React's own answer to
   * "reset this form when it reopens" — clearing five `useState`s from an
   * effect is a cascading render, and a form that remembers the last thing you
   * typed into it is a bug people notice immediately.
   */
  const [session, setSession] = React.useState(0);
  /*
   * The one thing that survives a dismissal: a title that was typed and then
   * escaped from. Escape and a click outside close the dialog, but neither is
   * "throw this away" — Cancel is, and so is adding the task — so the words
   * are offered back on the next opening rather than silently dropped
   * (specs/11-command-palette.md: nothing typed is lost).
   */
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

  /*
   * `Q` from anywhere. Ignored while the user is typing somewhere else, while a
   * modifier is held (that is a browser or OS shortcut), and while another
   * dialog is open — Radix marks the rest of the page `aria-hidden`, and
   * stacking a second dialog on top of a sheet is not a capture flow.
   */
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
  /** Called with the title to keep for next time — `""` when it was used or discarded. */
  onDismiss: (kept: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  /*
   * `Q` and the top bar's `+` open this from wherever the user was, so there is
   * no `Dialog.Trigger` for Radix to return focus to and its modal content
   * cancels the restore FocusScope would otherwise do — leaving a keyboard user
   * on `<body>` at the top of the page (Domain Rule 10). Same helper the
   * calendar's programmatically opened surfaces use.
   */
  const openerFocus = useOpenerFocus();

  /*
   * Seeded from `defaults` at mount, and the provider remounts this component
   * on every opening — so reopening starts clean, seeded by whatever the caller
   * asked for. Adding a task from inside a project should not require choosing
   * the project you are already in.
   */
  const [title, setTitle] = React.useState(initialTitle);
  const [projectId, setProjectId] = React.useState<Uuid | null>(defaults.projectId ?? null);
  const [priority, setPriority] = React.useState<TaskPriority | null>(null);
  const [dueDate, setDueDate] = React.useState<LocalDate | null>(defaults.dueDate ?? null);
  const [estimatedMinutes, setEstimatedMinutes] = React.useState<number | null>(null);
  /*
   * The tokens the user has taken back — by removing a chip, or by setting the
   * control that token was filling. The parser reads a dismissed token as an
   * ordinary word, so its text stays in the title exactly where it was typed
   * (specs/11-command-palette.md: never discard what was typed).
   */
  const [dismissed, setDismissed] = React.useState<readonly DismissedToken[]>([]);
  /*
   * The last failure, shown inside the dialog rather than as a toast. This is
   * a modal: a toast behind it is under Radix's pointer lock and outside its
   * focus trap, so a Retry offered there cannot be reached until the dialog is
   * closed — and closing it is what the user was avoiding. The message and its
   * Retry sit under the field instead, and a validation message sits on the
   * field it is about. Cleared by the next keystroke.
   */
  const [error, setError] = React.useState<(ActionError & { retry?: () => void }) | null>(null);

  /*
   * Recomputed on every keystroke, because it is a pure function of the string:
   * no effect, no debounce, and no parsed state that can fall out of step with
   * the input. That is what "typing stays fluid even when parsing fails" comes
   * down to — a line the parser cannot read costs a title with every word still
   * in it, and nothing else.
   */
  const parsed = React.useMemo(
    () => parseQuickAdd(title, { today, projects, dismissed }),
    [dismissed, projects, title, today],
  );

  const effective = {
    projectId: parsed.projectId ?? projectId,
    priority: parsed.priority ?? priority ?? DEFAULT_PRIORITY,
    dueDate: parsed.dueDate ?? dueDate,
    estimatedMinutes: parsed.estimatedMinutes ?? estimatedMinutes,
  };

  /*
   * What is wrong with the title, if anything: the schema's own bound, checked
   * as the user types, and otherwise whatever the server said about the field.
   */
  const titleError =
    parsed.title.length > TITLE_MAX_LENGTH
      ? `Titles are at most ${TITLE_MAX_LENGTH} characters.`
      : (error?.fieldErrors?.title?.[0] ?? null);
  const canSubmit = !pending && parsed.title !== "" && titleError === null;
  /* A failure that belongs to no field, or a field the dialog does not show. */
  const generalError =
    error === null || (error.code === "validation" && error.fieldErrors?.title !== undefined)
      ? null
      : error;

  /** Closes and forgets the draft: the words were used, or the user discarded them. */
  function close(): void {
    onDismiss("");
    onOpenChange(false);
  }

  /**
   * Setting a control takes its field over from the text: the tokens that were
   * filling it are dismissed — which returns their words to the title — and the
   * control's own value takes effect. One owner per field, always.
   */
  function takeOver(kind: ParsedFieldKind, apply: () => void): void {
    const taken = parsed.tokens.filter((token) => token.kind === kind);
    if (taken.length > 0) setDismissed((current) => [...current, ...taken.map(asDismissed)]);
    apply();
  }

  /*
   * `id` defaults once per gesture, not once per attempt: the failure toast's
   * Retry — offered for a rejected call as much as for a returned failure —
   * passes the same one back, so a retry after a lost response collides with
   * the row that already committed and `createTask` absorbs it as a success
   * instead of writing a twin (Domain Rule 17). Quick Add does not hold
   * an optimistic row of its own: it can be opened from any route, and most of
   * them do not render a task list to put one in. The task appears when
   * `refresh()` lands, and the toast confirms it in the meantime.
   */
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
        /*
         * A rejected call is not the same event as a returned `{ ok: false }`,
         * but the user has to experience it as one — the rule
         * `useOptimisticAction` applies, restated here because Quick Add is the
         * one write that does not go through it. Offline, a 5xx, an aborted
         * request, an action id gone stale after a deploy: all of them reject
         * here, and React re-throws a rejection out of the transition at the
         * next render, so the route's error boundary would replace whatever
         * page the user pressed `Q` on — over one uncaptured task.
         *
         * `unstable_rethrow` first, because `redirect()` and `notFound()`
         * travel as thrown values: those are control flow, not failure, and
         * swallowing one would strand the user on a page they were being moved
         * off. What is left is a transport failure or a bug inside the action —
         * still reported, it just no longer blanks the route on its way to
         * being seen. It falls through to the branch below, whose Retry hands
         * the same `id` back (Domain Rule 17).
         */
        unstable_rethrow(thrown);
        reportError(thrown, { source: "quickAdd" });
        result = failure(
          "unavailable",
          "Momentum could not reach the server. Your change was not saved.",
        );
      }

      if (!result.ok) {
        /*
         * Kept with the gesture's id so Retry resends the same row (Domain
         * Rule 17). A validation failure carries no Retry: the same input
         * cannot succeed twice, and the message says what to change.
         */
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
        // "Add another" is a fresh capture, chips and overrides included.
        setTitle("");
        setDismissed([]);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Escape or a click outside: the title is kept for the next opening.
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
          {/*
            One free-text input, and the only required field. Everything the
            parser recognises in it is shown as a chip below rather than being
            taken silently.

            No `autoFocus`: React applies it during commit, before Radix's
            FocusScope runs, and FocusScope skips its mount event entirely when
            focus is already inside — which would leave `useOpenerFocus` with
            nothing to send the user back to. With no close button this is the
            first tabbable node in the dialog, so FocusScope focuses exactly
            this field anyway.
          */}
          <Input
            value={title}
            // `readOnly`, never `disabled`, while the write is in flight: the
            // browser blurs a disabled element, and this is the element that
            // pressed Enter (Domain Rule 10).
            readOnly={pending}
            placeholder="What needs doing?"
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

          {/*
            What the parser took, and the way back out of it. Each chip is a
            real button (Domain Rule 10), and removing one returns its words to
            the title rather than deleting them — parsing is a suggestion, and a
            suggestion the user cannot decline is an interpretation.
          */}
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
            <Select
              value={effective.projectId ?? NO_PROJECT}
              disabled={pending}
              onValueChange={(value) =>
                takeOver("project", () => setProjectId(value === NO_PROJECT ? null : value))
              }
            >
              <SelectTrigger aria-label="Project" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PROJECT}>No project</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

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

          {/*
            `aria-disabled` with a guard, never the native attribute: Add is the
            control that starts the write, and a natively disabled button is
            blurred by the browser the moment it works (Domain Rule 10).
          */}
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
      </DialogContent>
    </Dialog>
  );
}

/** `4` — "no priority set", the value the schema defaults to. */
const DEFAULT_PRIORITY: TaskPriority = 4;

/**
 * A parsed token, as the thing the parser must stop treating as metadata.
 *
 * Keyed by kind and text rather than by position, so a dismissal survives the
 * user editing the front of the line — which they do constantly, since the
 * title is what they came here to type.
 */
function asDismissed(token: { kind: ParsedFieldKind; text: string }): DismissedToken {
  return { kind: token.kind, text: token.text };
}
