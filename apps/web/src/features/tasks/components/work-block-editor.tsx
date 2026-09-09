"use client";

import * as React from "react";
import { CalendarPlusIcon, TrashIcon } from "lucide-react";

import { MIN_BLOCK_MINUTES } from "@momentum/core/calendar";
import { addDays, formatDuration, formatLocalDate, formatMinutesOfDay } from "@momentum/core/time";
import type { LocalDate, Minutes, Uuid, Weekday } from "@momentum/core/types";

import { Button } from "@momentum/ui/components/button";
import { DatePicker } from "@momentum/ui/components/date-picker";
import { Input } from "@momentum/ui/components/input";
import { Label } from "@momentum/ui/components/label";

import type { BlockSpan } from "@/features/tasks/optimistic";
import type { TaskWorkBlock } from "@/features/tasks/types";

/**
 * A task's work blocks — all of them — with add, remove and adjust.
 *
 * This is Domain Rule 2 made visible. The list is 0..n rows, it is headed by
 * the count, and adding a second block does not replace the first. The empty
 * state says so in words, because a user who has only ever seen one-slot
 * schedulers will not assume otherwise.
 *
 * Each row is a day and a time range: a block is time on the calendar, and the
 * calendar is the surface that owns dragging it. Editing here writes the same
 * row a drag on the grid would.
 *
 * Nothing on this panel touches the task's due date, and the due date is edited
 * in a different section with a different label (Domain Rule 1).
 */
export function WorkBlockEditor({
  blocks,
  today,
  weekStart,
  defaultMinutes,
  disabled,
  onAdd,
  onUpdate,
  onRemove,
}: {
  blocks: readonly TaskWorkBlock[];
  today: LocalDate;
  weekStart: Weekday;
  /**
   * The length a new block asks for: what is left of the estimate, or a
   * sensible hour. It is bounded by the day the block lands on.
   */
  defaultMinutes: Minutes;
  disabled: boolean;
  onAdd: (span: BlockSpan) => void;
  onUpdate: (blockId: Uuid, span: BlockSpan) => void;
  onRemove: (blockId: Uuid) => void;
}) {
  const total = blocks.reduce((sum, block) => sum + block.minutes, 0);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Work blocks
        </h3>
        {blocks.length > 0 ? (
          <span data-slot="numeric" className="text-xs text-muted-foreground">
            {blocks.length} · {formatDuration(total)}
          </span>
        ) : null}
      </div>

      {blocks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No time reserved yet. A task can be worked across several blocks, on days other than its
          due date.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {blocks.map((block) => (
            <WorkBlockRow
              key={block.id}
              block={block}
              today={today}
              weekStart={weekStart}
              disabled={disabled}
              onUpdate={(span) => onUpdate(block.id, span)}
              onRemove={() => onRemove(block.id)}
            />
          ))}
        </ul>
      )}

      {/*
        `aria-disabled` with a guard, never the native attribute: `disabled` is
        the sheet's in-flight flag, which goes up *because* this button was
        pressed, and the browser blurs a natively disabled element — dropping
        the keyboard user who just added a block on `<body>` (Domain Rule 10;
        the same pattern as the arrows in `subtask-list.tsx`).
      */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-disabled={disabled || undefined}
        className="self-start aria-disabled:opacity-50"
        onClick={() => {
          if (disabled) return;
          /*
           * A new block starts on the day after the last one, at the same time,
           * so adding three blocks to a task is three clicks rather than three
           * date pickers. The first goes on today at 09:00 — a placement the
           * user is expected to adjust, not one the product is asserting is
           * right.
           */
          const last = blocks[blocks.length - 1];
          // `addDays` from the time module, never arithmetic here: a date is a
          // calendar date and month ends are not a component's business (Domain Rule 5).
          const date = last === undefined ? today : addDays(last.date, 1);
          const startMinutes = last === undefined ? 9 * 60 : last.startMinutes;

          /*
           * The block is bounded by its own day, which is what `clampSpan`
           * does for every block a drag on the grid creates. An estimate with
           * more left in it than the day has room for is the *first* of several
           * blocks, not one impossible one — unclamped, a remaining estimate
           * over ~39h builds an end past what `addWorkBlockInput` accepts, and
           * the button would fail identically on every click because a rejected
           * add never shrinks the remainder (Domain Rule 2).
           */
          const minutes = Math.max(
            MIN_BLOCK_MINUTES,
            Math.min(defaultMinutes, 1440 - startMinutes),
          );

          onAdd({ date, startMinutes, endMinutes: startMinutes + minutes });
        }}
      >
        <CalendarPlusIcon aria-hidden="true" />
        Add work block
      </Button>
    </section>
  );
}

function WorkBlockRow({
  block,
  today,
  weekStart,
  disabled,
  onUpdate,
  onRemove,
}: {
  block: TaskWorkBlock;
  today: LocalDate;
  weekStart: Weekday;
  disabled: boolean;
  onUpdate: (span: BlockSpan) => void;
  onRemove: () => void;
}) {
  const label = `${formatLocalDate(block.date, "medium")}, ${formatMinutesOfDay(
    block.startMinutes,
  )} to ${formatMinutesOfDay(block.endMinutes % 1440)}`;

  return (
    <li className="flex flex-col gap-1.5 rounded-lg border p-2">
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <Label className="sr-only" htmlFor={`block-date-${block.id}`}>
            Day for the block on {label}
          </Label>
          <DatePicker
            id={`block-date-${block.id}`}
            value={block.date}
            today={today}
            weekStart={weekStart}
            aria-label={`Day, currently ${formatLocalDate(block.date, "medium")}`}
            onValueChange={(date) => {
              if (date === null) return;
              onUpdate({ date, startMinutes: block.startMinutes, endMinutes: block.endMinutes });
            }}
          />
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-disabled={disabled || undefined}
          className="aria-disabled:opacity-50"
          onClick={() => {
            if (disabled) return;
            onRemove();
          }}
        >
          <TrashIcon aria-hidden="true" />
          <span className="sr-only">Remove the block on {label}</span>
        </Button>
      </div>

      <div className="flex items-center gap-1.5">
        <TimeField
          id={`block-start-${block.id}`}
          label={`Start time for the block on ${formatLocalDate(block.date, "medium")}`}
          minutes={block.startMinutes}
          onCommit={(startMinutes) =>
            onUpdate({
              date: block.date,
              startMinutes,
              // The block keeps its **wall-clock** length when it is moved,
              // which is what a drag on the grid does and what a user means by
              // changing when something starts. `block.minutes` is the elapsed
              // length and differs on a DST day; using it here would silently
              // resize the block by an hour twice a year.
              endMinutes: startMinutes + (block.endMinutes - block.startMinutes),
            })
          }
        />
        <span aria-hidden="true" className="text-xs text-muted-foreground">
          –
        </span>
        <TimeField
          id={`block-end-${block.id}`}
          label={`End time for the block on ${formatLocalDate(block.date, "medium")}`}
          minutes={block.endMinutes}
          onCommit={(endMinutes) =>
            onUpdate({ date: block.date, startMinutes: block.startMinutes, endMinutes })
          }
        />
        <span data-slot="numeric" className="ml-auto text-xs text-muted-foreground">
          {formatDuration(block.minutes)}
        </span>
      </div>
    </li>
  );
}

/**
 * A wall-clock time as `HH:MM`.
 *
 * `<input type="time">` rather than a custom control: it is keyboard-operable,
 * localised and understood by assistive technology for free. The value it
 * carries is wall clock in the user's timezone — never an instant — and the
 * server converts it (Domain Rule 4).
 *
 * A block ending past midnight is shown modulo the day, because "00:30" is what
 * the clock says; the minutes-from-start-of-day arithmetic stays in the caller,
 * which is the only place that knows which day the block started on.
 */
function TimeField({
  id,
  label,
  minutes,
  onCommit,
}: {
  id: string;
  label: string;
  minutes: Minutes;
  onCommit: (minutes: Minutes) => void;
}) {
  const wraps = minutes >= 1440;
  const value = toTimeValue(minutes % 1440);

  return (
    <div className="flex items-center gap-1">
      <Label className="sr-only" htmlFor={id}>
        {label}
      </Label>
      <Input
        id={id}
        type="time"
        step={300}
        value={value}
        aria-label={label}
        className="h-7 w-[7.5rem] px-1.5 text-xs tabular-nums"
        onChange={(event) => {
          const parsed = fromTimeValue(event.target.value);
          if (parsed === null) return;
          // A block that already ran past midnight keeps doing so: the field
          // edits the clock reading, not which day the block ends on.
          onCommit(wraps ? parsed + 1440 : parsed);
        }}
      />
      {wraps ? (
        <span className="text-2xs text-muted-foreground" title="The next day">
          +1
        </span>
      ) : null}
    </div>
  );
}

function toTimeValue(minutes: Minutes): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function fromTimeValue(value: string): Minutes | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const rest = Number(match[2]);
  if (hours > 23 || rest > 59) return null;
  return hours * 60 + rest;
}
