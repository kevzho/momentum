"use client";

import * as React from "react";
import { CalendarIcon, XIcon } from "lucide-react";
import { cn } from "cn";

import { addDays, formatLocalDate, isLocalDate, localDate } from "@momentum/core/time";
import type { LocalDate, Weekday } from "@momentum/core/types";

import { Button } from "@momentum/ui/components/button";
import { Calendar } from "@momentum/ui/components/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@momentum/ui/components/popover";
import { Separator } from "@momentum/ui/components/separator";

/**
 * A due date. Emits `LocalDate` — a calendar date in the user's timezone — and
 * never an instant (Domain Rules 1 and 4).
 *
 * The seam with `react-day-picker` is the whole job here. That library speaks
 * `Date`, and given no `timeZone` prop it builds every grid day with
 * `new Date(year, month, day)` — midnight in the *browser's* zone — then hands
 * one of those objects straight back through `onSelect`. So the two
 * conversions below are the only place a `Date` exists and they both read and
 * write the browser's own calendar fields, which is the picker's convention:
 * the offset cancels on both edges and the day that leaves this component is
 * the day whose cell the user clicked. The `Date` is a shell for the grid and
 * never escapes; only the `LocalDate` string is persisted.
 *
 * `today` is passed in, resolved on the server in the profile timezone. This
 * component never asks the browser what day it is.
 */
function DatePicker({
  value,
  onValueChange,
  today,
  weekStart = 1,
  id,
  placeholder = "No due date",
  className,
  disabled,
  "aria-label": ariaLabel = "Due date",
}: {
  value: LocalDate | null;
  onValueChange: (value: LocalDate | null) => void;
  /** Today in the user's timezone, for the shortcuts and the "today" ring. */
  today: LocalDate;
  weekStart?: Weekday;
  id?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const [open, setOpen] = React.useState(false);

  function choose(next: LocalDate | null): void {
    onValueChange(next);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            "h-8 w-full justify-start gap-2 px-2.5 font-normal",
            value === null && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate" data-slot={value === null ? undefined : "numeric"}>
            {value === null ? placeholder : formatLocalDate(value, "medium")}
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-auto p-0">
        {/* The three dates that account for most due dates, one click each. */}
        <div className="flex flex-col gap-0.5 p-1.5">
          <Shortcut label="Today" onSelect={() => choose(today)} />
          <Shortcut label="Tomorrow" onSelect={() => choose(addDays(today, 1))} />
          <Shortcut label="Next week" onSelect={() => choose(addDays(today, 7))} />
          {value === null ? null : (
            <Shortcut label="Clear due date" icon={XIcon} onSelect={() => choose(null)} />
          )}
        </div>

        <Separator />

        <Calendar
          mode="single"
          autoFocus
          weekStartsOn={weekStart}
          selected={value === null ? undefined : toDate(value)}
          defaultMonth={toDate(value ?? today)}
          today={toDate(today)}
          onSelect={(date) => choose(date === undefined ? null : fromDate(date))}
        />
      </PopoverContent>
    </Popover>
  );
}

function Shortcut({
  label,
  icon: Icon,
  onSelect,
}: {
  label: string;
  icon?: typeof XIcon;
  onSelect: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 justify-start px-2 font-normal"
      onClick={onSelect}
    >
      {Icon ? <Icon className="size-3.5" aria-hidden="true" /> : null}
      {label}
    </Button>
  );
}

/**
 * `LocalDate` → the `Date` react-day-picker wants: local midnight, the same
 * instant its own `DateLib` builds for that grid day, so the picker's
 * `isSameDay` rings the selected cell and the "today" cell it was given.
 */
function toDate(date: LocalDate): Date {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(year, month - 1, day);
}

/**
 * The picker's `Date` → `LocalDate`, read in the browser's zone.
 *
 * `getFullYear` and friends, never the UTC getters: `onSelect` hands back one
 * of the grid's own day objects, and those are built at *local* midnight, so
 * reading their UTC fields returns the previous day anywhere east of UTC.
 */
function fromDate(date: Date): LocalDate {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const text = `${year}-${month}-${day}`;

  if (!isLocalDate(text)) {
    throw new Error(`The date picker produced something that is not a date: ${text}`);
  }
  return localDate(text);
}

export { DatePicker };
