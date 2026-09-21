"use client";

import * as React from "react";
import { unstable_rethrow, useRouter } from "next/navigation";

import {
  EVENT_FIELDS,
  TASK_FIELDS,
  parseQuickAdd,
  type DismissedToken,
  type ParsedFieldKind,
  type TimeOfDaySpan,
} from "@momentum/core/parser";
import {
  formatDuration,
  formatLocalDate,
  formatMinutesOfDay,
  minutesOfLocalTimeValue,
} from "@momentum/core/time";
import type { LocalDate, Minutes, Task, TaskPriority, Uuid, Weekday } from "@momentum/core/types";

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
import { Label } from "@momentum/ui/components/label";
import { PrioritySelect } from "@momentum/ui/components/priority-select";
import { SegmentedControl } from "@momentum/ui/components/segmented-control";
import { Switch } from "@momentum/ui/components/switch";
import { toast } from "@momentum/ui/components/toast";
import { cn } from "@momentum/ui/lib/utils";

import { createBlock } from "@/features/calendar/actions";
import { calendarHref, DEFAULT_VIEW } from "@/features/calendar/navigation";
import { useProjectManager } from "@/features/projects/components/project-manager";
import { ProjectSelect } from "@/features/projects/components/project-select";
import { createTask } from "@/features/tasks/actions";
import {
  QuickAddContext,
  type QuickAddContextValue,
  type QuickAddDefaults,
  type QuickAddKind,
} from "@/features/tasks/components/quick-add-context";
import type { ProjectSummary } from "@/features/tasks/types";
import { failure, type ActionError, type ActionResult } from "@/lib/actions/result";
import { reportError } from "@/lib/report-error";
import { useOpenerFocus } from "@/lib/use-opener-focus";

// Quick Add, mounted once in the shell. The title runs through
// `@momentum/core/parser` on every keystroke; recognised tokens show as chips.
// Whichever of the chip or the control below most recently expressed the
// intent owns the value, and nothing the user typed is ever discarded.
//
// It captures two things: a task (a deadline, never a clock time) and an
// event (a day on the calendar, with or without a clock time — an exam, a
// class, an appointment). The parser reads different fields for each, so
// "9am" is a time on an event and title text on a task.
//
// The handle (`useQuickAdd`) lives in `quick-add-context.ts`.
export {
  useQuickAdd,
  type QuickAddContextValue,
  type QuickAddDefaults,
  type QuickAddKind,
} from "@/features/tasks/components/quick-add-context";

/** Mirrors `createTaskInput`. */
const TITLE_MAX_LENGTH = 500;
/** Mirrors `createBlockInput`, which is stricter. */
const EVENT_TITLE_MAX_LENGTH = 200;

const DEFAULT_PLACEHOLDER = "What needs doing?";
const EVENT_PLACEHOLDER = "Chem test oct 3 9am";

/** An event with a start and nothing else runs this long. */
const DEFAULT_EVENT_MINUTES: Minutes = 60;
/** Where the clock lands when "All day" is switched off by hand. */
const DEFAULT_EVENT_START: Minutes = 9 * 60;
const MINUTES_PER_DAY: Minutes = 1440;
/** `createBlockInput` lets an end run at most a day past its start. */
const MAX_END_MINUTES: Minutes = 2 * MINUTES_PER_DAY;

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
  const [kind, setKind] = React.useState<QuickAddKind>(defaults.kind ?? "task");
  const [title, setTitle] = React.useState(initialTitle);
  const [projectId, setProjectId] = React.useState<Uuid | null>(defaults.projectId ?? null);
  const [priority, setPriority] = React.useState<TaskPriority | null>(null);
  const [dueDate, setDueDate] = React.useState<LocalDate | null>(defaults.dueDate ?? null);
  const [estimatedMinutes, setEstimatedMinutes] = React.useState<number | null>(null);
  // An event's clock time, from its controls; null is all day.
  const [time, setTime] = React.useState<TimeOfDaySpan | null>(null);
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
    () =>
      parseQuickAdd(title, {
        today,
        projects: manager.projects,
        dismissed,
        fields: kind === "event" ? EVENT_FIELDS : TASK_FIELDS,
      }),
    [dismissed, kind, manager.projects, title, today],
  );

  const effective = {
    projectId: parsed.projectId ?? projectId,
    priority: parsed.priority ?? priority ?? DEFAULT_PRIORITY,
    dueDate: parsed.dueDate ?? dueDate,
    estimatedMinutes: parsed.estimatedMinutes ?? estimatedMinutes,
    time: parsed.time ?? time,
  };

  // An event always has a day — today unless one is given — and is all day
  // unless it has a clock time. A start alone runs for the typed length, or an hour.
  const event = React.useMemo(() => {
    const date = effective.dueDate ?? today;
    const span = effective.time;
    if (span === null) {
      return { date, allDay: true, startMinutes: 0, endMinutes: MINUTES_PER_DAY };
    }
    const endMinutes =
      span.endMinutes ??
      Math.min(
        span.startMinutes + (effective.estimatedMinutes ?? DEFAULT_EVENT_MINUTES),
        MAX_END_MINUTES,
      );
    return { date, allDay: false, startMinutes: span.startMinutes, endMinutes };
  }, [effective.dueDate, effective.estimatedMinutes, effective.time, today]);

  const titleLimit = kind === "event" ? EVENT_TITLE_MAX_LENGTH : TITLE_MAX_LENGTH;
  const titleError =
    parsed.title.length > titleLimit
      ? `Titles are at most ${titleLimit} characters.`
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

  // The kind is a control too: switching re-reads the title with the other
  // fields, so a "9am" that was title text on a task becomes a time.
  function switchKind(next: QuickAddKind): void {
    setKind(next);
    setError(null);
  }

  // `id` defaults once per gesture, not per attempt, so Retry after a lost
  // response collides with the row that already committed instead of writing
  // a twin. No optimistic row: most routes have no task list to put one in.
  function submit(closeAfter: boolean, id: Uuid = crypto.randomUUID()): void {
    if (!canSubmit) return;
    setError(null);

    startTransition(async () => {
      let result: ActionResult<unknown>;
      try {
        result = kind === "event" ? await createEvent(id) : await createTaskRow(id);
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
        action: {
          label: "Open",
          onClick: () =>
            router.push(
              kind === "event"
                ? calendarHref(event.date, DEFAULT_VIEW, today)
                : `/tasks?task=${id}`,
            ),
        },
      });

      if (closeAfter) {
        close();
      } else {
        setTitle("");
        setDismissed([]);
      }
    });
  }

  function createTaskRow(id: Uuid): Promise<ActionResult<Task>> {
    return createTask({
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
  }

  function createEvent(id: Uuid): Promise<ActionResult<unknown>> {
    return createBlock({
      id,
      kind: "event",
      title: parsed.title,
      description: null,
      color: null,
      date: event.date,
      startMinutes: event.startMinutes,
      endMinutes: event.endMinutes,
      allDay: event.allDay,
      recurrence: null,
    });
  }

  // The clock controls write the whole span, so a typed "9am" chip and a
  // retyped end cannot both claim it.
  function setClock(startMinutes: Minutes, endMinutes: Minutes | null): void {
    takeOver("time", () => setTime({ startMinutes, endMinutes }));
  }

  const isEvent = kind === "event";

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
          <DialogTitle className="text-sm font-semibold">
            {isEvent ? "New event" : "New task"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {isEvent ? (
              <>
                A title and a day — or write it in: “oct 3”, “fri 9am”, “9–11am”. No time means all
                day. Press <Kbd>Enter</Kbd> to add it, <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> to add
                another.
              </>
            ) : (
              <>
                A title is enough — or write the rest into it: “due fri”, “oct 3”, “90m”, “p1”,
                “#project”. Press <Kbd>Enter</Kbd> to add it, <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> to
                add another.
              </>
            )}
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
            placeholder={
              defaults.placeholder ?? (isEvent ? EVENT_PLACEHOLDER : DEFAULT_PLACEHOLDER)
            }
            aria-label={isEvent ? "Event title" : "Task title"}
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

          {isEvent ? (
            <div className="grid grid-cols-2 gap-2">
              <DatePicker
                aria-label="Date"
                clearLabel="Use today"
                value={event.date}
                today={today}
                weekStart={weekStart}
                disabled={pending}
                onValueChange={(next) => takeOver("date", () => setDueDate(next))}
              />

              <div className="flex h-8 items-center gap-2 px-1">
                <Switch
                  id="quick-add-all-day"
                  size="sm"
                  checked={event.allDay}
                  disabled={pending}
                  onCheckedChange={(allDay) => {
                    if (allDay) takeOver("time", () => setTime(null));
                    else setClock(DEFAULT_EVENT_START, null);
                  }}
                />
                <Label htmlFor="quick-add-all-day">All day</Label>
              </div>

              {event.allDay ? null : (
                <>
                  <Input
                    type="time"
                    aria-label="Start"
                    className="h-8"
                    value={formatMinutesOfDay(event.startMinutes)}
                    disabled={pending}
                    onChange={(change) => {
                      const minutes = minutesOfLocalTimeValue(change.target.value);
                      if (minutes !== null) setClock(minutes, null);
                    }}
                  />
                  <Input
                    type="time"
                    aria-label="End"
                    className="h-8"
                    value={formatMinutesOfDay(event.endMinutes)}
                    disabled={pending}
                    onChange={(change) => {
                      const minutes = minutesOfLocalTimeValue(change.target.value);
                      if (minutes === null) return;
                      // An end at or before the start is the next day's, as the editor reads it.
                      const end =
                        minutes > event.startMinutes ? minutes : minutes + MINUTES_PER_DAY;
                      setClock(event.startMinutes, end);
                    }}
                  />
                </>
              )}

              <p data-slot="numeric" className="col-span-2 text-xs text-muted-foreground">
                {describeEvent(event)}
              </p>
            </div>
          ) : (
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
          )}

          {/* `aria-disabled` plus a guard, never native `disabled`: the browser
              would blur the button that started the write. */}
          <div className="flex items-center justify-between gap-2">
            <SegmentedControl<QuickAddKind>
              label="What to add"
              value={kind}
              onValueChange={switchKind}
              options={[
                { value: "task", label: "Task" },
                { value: "event", label: "Event" },
              ]}
            />
            <div className="flex items-center gap-2">
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
                {isEvent ? "Add event" : "Add task"}
              </Button>
            </div>
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

/** "Oct 3, 2026 · All day" · "Oct 3, 2026 · 09:00 – 11:00 · 2h". */
function describeEvent(event: {
  date: LocalDate;
  allDay: boolean;
  startMinutes: Minutes;
  endMinutes: Minutes;
}): string {
  const day = formatLocalDate(event.date, "medium");
  if (event.allDay) return `${day} · All day`;
  const crossesMidnight = event.endMinutes >= MINUTES_PER_DAY;
  return `${day} · ${formatMinutesOfDay(event.startMinutes)} – ${formatMinutesOfDay(event.endMinutes)}${crossesMidnight ? " next day" : ""} · ${formatDuration(event.endMinutes - event.startMinutes)}`;
}
