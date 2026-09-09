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
import type { Minutes, SnapMinutes } from "@momentum/core/types";

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

import { droppedMessage } from "@/features/calendar/announcements";
import type { DaySpan } from "@/features/calendar/types";
import { TODAY_COPY } from "@/features/today/copy";
import type { TodayItem } from "@/features/today/types";
import { useOpenerFocus } from "@/lib/use-opener-focus";

/**
 * Next Up's Reschedule control.
 *
 * The calendar is where a week is arranged; this is the one move a person makes
 * without leaving the day — "not now, at four" — so it is three fields and a
 * button rather than a second grid. It commits the same wall-clock
 * `DaySpan` a drag on the board commits, through the same action, so the two
 * routes cannot produce different rows (Domain Rule 10: a pointer gesture and
 * its keyboard equivalent are one mutation).
 *
 * A dialog rather than a popover because it holds a form with three fields and
 * an error message, and because Radix's focus management is what makes the
 * whole interaction reachable by keyboard. `useOpenerFocus` returns focus to
 * the control that opened it rather than to `<body>`.
 *
 * Wall clock in, wall clock out. The client never asserts an instant; the
 * server converts with the profile timezone (Domain Rule 4).
 */
export function RescheduleDialog({
  entry,
  span,
  snapMinutes,
  onReschedule,
  onClose,
}: {
  /** The block being moved; `null` closes the dialog. */
  entry: TodayItem | null;
  /** Its current wall-clock span, from `spanOf` — the day it starts on. */
  span: DaySpan | null;
  snapMinutes: SnapMinutes;
  onReschedule: (entry: TodayItem, span: DaySpan) => void;
  onClose: () => void;
}) {
  const openerFocus = useOpenerFocus();

  return (
    <Dialog
      open={entry !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {entry === null || span === null ? null : (
        <DialogContent
          onOpenAutoFocus={openerFocus.onOpenAutoFocus}
          onCloseAutoFocus={openerFocus.onCloseAutoFocus}
        >
          <DialogHeader>
            <DialogTitle>{TODAY_COPY.reschedule.title}</DialogTitle>
            <DialogDescription>{entry.item.title}</DialogDescription>
          </DialogHeader>
          <RescheduleForm
            key={entry.item.id}
            entry={entry}
            span={span}
            snapMinutes={snapMinutes}
            onReschedule={onReschedule}
            onClose={onClose}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

type ErrorField = "date" | "start" | "duration";

function RescheduleForm({
  entry,
  span,
  snapMinutes,
  onReschedule,
  onClose,
}: {
  entry: TodayItem;
  span: DaySpan;
  snapMinutes: SnapMinutes;
  onReschedule: (entry: TodayItem, span: DaySpan) => void;
  onClose: () => void;
}) {
  const announce = useAnnounce();
  const ids = React.useId();
  const dateRef = React.useRef<HTMLInputElement>(null);
  const startRef = React.useRef<HTMLInputElement>(null);
  const durationRef = React.useRef<HTMLInputElement>(null);

  const [date, setDate] = React.useState<string>(span.date);
  const [start, setStart] = React.useState<string>(formatMinutesOfDay(span.startMinutes));
  const [duration, setDuration] = React.useState<string>(
    String(span.endMinutes - span.startMinutes),
  );
  const [error, setError] = React.useState<{ field: ErrorField; message: string } | null>(null);

  function fail(field: ErrorField, message: string, node: HTMLElement | null) {
    setError({ field, message });
    announce(message);
    node?.focus();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const startMinutes = minutesOfLocalTimeValue(start);
    const length = Number(duration);

    if (!isLocalDate(date)) {
      fail("date", TODAY_COPY.reschedule.pickDate, dateRef.current);
      return;
    }
    if (startMinutes === null) {
      fail("start", TODAY_COPY.reschedule.pickStart, startRef.current);
      return;
    }
    if (!Number.isInteger(length) || length < MIN_BLOCK_MINUTES) {
      fail("duration", minimumMessage(MIN_BLOCK_MINUTES), durationRef.current);
      return;
    }
    if (startMinutes + length > MINUTES_PER_DAY) {
      fail("duration", TODAY_COPY.reschedule.pastMidnight, durationRef.current);
      return;
    }

    const next: DaySpan = {
      date: localDate(date),
      startMinutes,
      endMinutes: startMinutes + length,
    };
    onReschedule(entry, next);
    // The same sentence the board speaks for the same result, from the same
    // module, so a keyboard user hears what a pointer user hears.
    announce(droppedMessage(entry.item.title, next));
    onClose();
  }

  const previewStart = minutesOfLocalTimeValue(start);
  const previewLength = Number(duration);
  const preview =
    isLocalDate(date) && previewStart !== null && previewLength >= MIN_BLOCK_MINUTES
      ? `${formatLocalDate(localDate(date), "medium")} · ${formatMinutesOfDay(previewStart)} – ${formatMinutesOfDay(previewStart + previewLength)}`
      : null;

  return (
    // `noValidate`: the inline messages say what to do about a bad value; the
    // browser's own bubbles would pre-empt them.
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-date`}>{TODAY_COPY.reschedule.date}</Label>
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
          <Label htmlFor={`${ids}-start`}>{TODAY_COPY.reschedule.start}</Label>
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
          <Label htmlFor={`${ids}-duration`}>{TODAY_COPY.reschedule.duration}</Label>
          <Input
            id={`${ids}-duration`}
            ref={durationRef}
            type="number"
            inputMode="numeric"
            min={MIN_BLOCK_MINUTES}
            step={snapMinutes}
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
          {TODAY_COPY.reschedule.cancel}
        </Button>
        <Button type="submit" size="sm">
          {TODAY_COPY.reschedule.submit}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Wall clock, always: a day reads 00:00 to 24:00 whether or not its clock moved. */
const MINUTES_PER_DAY: Minutes = 1440;

function minimumMessage(minutes: Minutes): string {
  return `A block is at least ${minutes} minutes.`;
}
