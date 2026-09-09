"use client";

import * as React from "react";

import { MIN_BLOCK_MINUTES } from "@momentum/core/calendar";
import {
  formatLocalDate,
  formatMinutesOfDay,
  isLocalDate,
  localDate,
  minutesOfLocalTimeValue,
} from "@momentum/core/time";
import type { LocalDate, Minutes, Uuid } from "@momentum/core/types";

import { useAnnounce } from "@momentum/ui/components/announcer";
import { Button } from "@momentum/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@momentum/ui/components/dialog";
import { Input } from "@momentum/ui/components/input";
import { Label } from "@momentum/ui/components/label";

import { scheduledMessage } from "@/features/calendar/announcements";
import { MINUTES_PER_DAY } from "@/features/calendar/components/block-editor";
import { useOpenerFocus } from "@/lib/use-opener-focus";
import type { CalendarSettings, DaySpan, PlanTask } from "@/features/calendar/types";
import { SCHEDULE_TASK, minimumBlockMessage } from "@/features/planning/copy";
import { taskBlockMinutes } from "@/features/planning/live";

/**
 * The manual route to scheduling a task (Domain Rule 10,
 * docs/ARCHITECTURE.md §9: "Focus task → `S` → slot picker → Enter").
 *
 * It commits through the same `onScheduleTask(taskId, span)` callback the drop
 * path and Find Time use, and sizes the block with the same `taskBlockMinutes`,
 * so the three routes cannot drift apart in what they create.
 *
 * `ScheduleTaskContent` — the header and the form without a dialog around
 * them — is exported so Find Time can offer "Pick a time instead" inside its
 * own dialog. Closing one Radix dialog and opening another in the same event
 * would hand focus to whatever was under the pointer, and the second dialog
 * would return it to `<body>` on close; staying in one dialog keeps the opener
 * the row the user came from.
 */

/**
 * Where the picker opens when the user has expressed no preference.
 *
 * 09:00 — or the top of the grid when the grid starts later. The "next free
 * slot" is Find Time's answer, one keystroke away on the same row; this dialog
 * is for the user who already has a time in mind.
 */
const DEFAULT_START_MINUTES: Minutes = 9 * 60;

export interface ScheduleTaskDialogProps {
  /** The task being scheduled; `null` closes the dialog. */
  task: PlanTask | null;
  settings: CalendarSettings;
  /** The displayed range, so the default date is a day the user can see. */
  days: readonly LocalDate[];
  today: LocalDate;
  onSchedule: (taskId: Uuid, span: DaySpan) => void;
  onClose: () => void;
}

export function ScheduleTaskDialog({
  task,
  settings,
  days,
  today,
  onSchedule,
  onClose,
}: ScheduleTaskDialogProps) {
  const openerFocus = useOpenerFocus();

  return (
    <Dialog
      open={task !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {task === null ? null : (
        <DialogContent
          onOpenAutoFocus={openerFocus.onOpenAutoFocus}
          onCloseAutoFocus={openerFocus.onCloseAutoFocus}
        >
          <ScheduleTaskContent
            task={task}
            settings={settings}
            days={days}
            today={today}
            onSchedule={onSchedule}
            onClose={onClose}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

export interface ScheduleTaskContentProps {
  task: PlanTask;
  settings: CalendarSettings;
  days: readonly LocalDate[];
  today: LocalDate;
  onSchedule: (taskId: Uuid, span: DaySpan) => void;
  onClose: () => void;
  /**
   * Focus the date field on mount. Off by default, because a freshly opened
   * dialog lets Radix focus the first field itself — and reads the opener from
   * `document.activeElement` first, which a mount-time focus would overwrite.
   * On when the form replaces other content inside an already open dialog.
   */
  autoFocusDate?: boolean;
}

/** The header and the form. Keyed by task, so each open starts from that task's own defaults. */
export function ScheduleTaskContent({ task, ...form }: ScheduleTaskContentProps) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{SCHEDULE_TASK.title}</DialogTitle>
        <DialogDescription>{task.title}</DialogDescription>
      </DialogHeader>
      <ScheduleTaskForm key={task.id} task={task} {...form} />
    </>
  );
}

type ErrorField = "date" | "start" | "duration";

interface FieldError {
  field: ErrorField;
  message: string;
}

/** A day the user is looking at, preferring today when the range contains it. */
function defaultDate(days: readonly LocalDate[], today: LocalDate): LocalDate {
  if (days.includes(today)) return today;
  return days[0] ?? today;
}

function ScheduleTaskForm({
  task,
  settings,
  days,
  today,
  onSchedule,
  onClose,
  autoFocusDate = false,
}: ScheduleTaskContentProps) {
  const announce = useAnnounce();
  const ids = React.useId();
  const dateRef = React.useRef<HTMLInputElement>(null);
  const startRef = React.useRef<HTMLInputElement>(null);
  const durationRef = React.useRef<HTMLInputElement>(null);

  const [date, setDate] = React.useState<string>(defaultDate(days, today));
  const [start, setStart] = React.useState<string>(
    formatMinutesOfDay(Math.max(DEFAULT_START_MINUTES, settings.spec.dayStartMinutes)),
  );
  // Seeded from the estimate, which is what the drop path uses as the block's
  // length (specs/03-weekly-calendar.md). Editable, because a keyboard user
  // picking a slot is exactly the moment to say "only an hour of this today".
  const [duration, setDuration] = React.useState<string>(String(taskBlockMinutes(task)));
  const [error, setError] = React.useState<FieldError | null>(null);

  React.useEffect(() => {
    if (autoFocusDate) dateRef.current?.focus();
  }, [autoFocusDate]);

  function fail(field: ErrorField, message: string, node: HTMLElement | null) {
    setError({ field, message });
    announce(message);
    node?.focus();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const startMinutes = minutesOfLocalTimeValue(start);
    const durationMinutes = Number(duration);

    if (!isLocalDate(date)) {
      fail("date", SCHEDULE_TASK.pickDate, dateRef.current);
      return;
    }
    if (startMinutes === null) {
      fail("start", SCHEDULE_TASK.pickStart, startRef.current);
      return;
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes < MIN_BLOCK_MINUTES) {
      fail("duration", minimumBlockMessage(MIN_BLOCK_MINUTES), durationRef.current);
      return;
    }
    if (startMinutes + durationMinutes > MINUTES_PER_DAY) {
      fail("duration", SCHEDULE_TASK.pastMidnight, durationRef.current);
      return;
    }

    const span: DaySpan = {
      date: localDate(date),
      startMinutes,
      endMinutes: startMinutes + durationMinutes,
    };
    onSchedule(task.id, span);
    // The same sentence the drop path speaks, so a keyboard user and a pointer
    // user hear the same thing for the same result.
    announce(scheduledMessage(task.title, span));
    onClose();
  }

  const previewStart = minutesOfLocalTimeValue(start);
  const previewDuration = Number(duration);
  const preview =
    isLocalDate(date) && previewStart !== null && previewDuration >= MIN_BLOCK_MINUTES
      ? `${formatLocalDate(localDate(date), "medium")} · ${formatMinutesOfDay(previewStart)} – ${formatMinutesOfDay(previewStart + previewDuration)}`
      : null;

  return (
    // `noValidate`: the inline messages below say what to do about a bad value;
    // the browser's own bubbles would pre-empt them.
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-date`}>{SCHEDULE_TASK.date}</Label>
        <Input
          id={`${ids}-date`}
          ref={dateRef}
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          aria-invalid={error?.field === "date" || undefined}
          aria-describedby={error?.field === "date" ? `${ids}-error` : undefined}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-start`}>{SCHEDULE_TASK.start}</Label>
          <Input
            id={`${ids}-start`}
            ref={startRef}
            type="time"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            aria-invalid={error?.field === "start" || undefined}
            aria-describedby={error?.field === "start" ? `${ids}-error` : undefined}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-duration`}>{SCHEDULE_TASK.duration}</Label>
          <Input
            id={`${ids}-duration`}
            ref={durationRef}
            type="number"
            inputMode="numeric"
            min={MIN_BLOCK_MINUTES}
            step={settings.snapMinutes}
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
            aria-invalid={error?.field === "duration" || undefined}
            aria-describedby={error?.field === "duration" ? `${ids}-error` : undefined}
          />
        </div>
      </div>

      {error === null ? (
        preview === null ? null : (
          <p data-slot="numeric" className="text-xs text-muted-foreground">
            {preview}
          </p>
        )
      ) : (
        <p id={`${ids}-error`} className="text-xs text-destructive">
          {error.message}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {SCHEDULE_TASK.cancel}
        </Button>
        <Button type="submit" size="sm">
          {SCHEDULE_TASK.submit}
        </Button>
      </DialogFooter>
    </form>
  );
}
