"use client";

import * as React from "react";
import { PlusIcon, XIcon } from "lucide-react";

import {
  localTime,
  localTimeOfMinutes,
  minutesOfLocalTime,
  minutesOfLocalTimeValue,
} from "@momentum/core/time";
import type { Minutes, TimeWindow } from "@momentum/core/types";
import { Button } from "@momentum/ui/components/button";
import { Input } from "@momentum/ui/components/input";

/**
 * A list of wall-clock windows with the controls to edit it: a start and an
 * end per window, a remove button per window, and one add button.
 *
 * Used for a weekday's working hours and for the focus windows, which are the
 * same shape with different words around them. It holds no server state and
 * makes no request: every edit is reported through one `onChange` with the
 * whole new list, and the page decides what to do with it.
 *
 * The inputs are `<input type="time">` rather than a custom control — they
 * are keyboard-operable, localised and understood by assistive technology
 * for free. The values are wall clock in the user's timezone, never instants
 * (Domain Rule 4), and they are parsed only through the time module.
 */

export interface TimeWindowListProps {
  /** Prefix for the inputs' ids; unique on the page. */
  id: string;
  /** Names the list for assistive technology: "Monday", "Focus". */
  label: string;
  windows: readonly TimeWindow[];
  /** What an empty list reads as: "Day off" for a weekday, "None" for focus windows. */
  emptyLabel: string;
  /** True while a write of this list is in flight. */
  disabled?: boolean;
  onChange: (windows: TimeWindow[]) => void;
}

/** Mirrors the schema's bound; a seventh window is refused before it is sent. */
const MAX_WINDOWS = 6;

/** 15 minutes, in the seconds `<input type="time">` counts its step in. */
const STEP_SECONDS = 900;

const MINUTES_PER_DAY: Minutes = 1_440;

/** A new window starts an hour after the latest one ends, and runs for three. */
const GAP_MINUTES: Minutes = 60;
const NEW_WINDOW_MINUTES: Minutes = 180;

/** No window can start later than this and still be an hour long. */
const LATEST_START: Minutes = MINUTES_PER_DAY - 60;

/** The last 15-minute step of the day: an end can be no later without wrapping. */
const LATEST_END: Minutes = MINUTES_PER_DAY - 15;

/** What an empty list starts with. */
const FIRST_WINDOW: TimeWindow = { start: localTime("09:00"), end: localTime("17:00") };

/**
 * The window "Add" would append, or null when the day has no room for one.
 *
 * After the latest end so the new window never overlaps an existing one —
 * the schema would merge it into its neighbour on save, and a button whose
 * effect was to change nothing would look broken. Three hours is a length the
 * user will edit; the point is a valid row to start from.
 */
function nextWindow(windows: readonly TimeWindow[]): TimeWindow | null {
  if (windows.length === 0) return FIRST_WINDOW;

  const latestEnd = Math.max(...windows.map((window) => minutesOfLocalTime(window.end)));
  const start = latestEnd + GAP_MINUTES;
  if (start > LATEST_START) return null;

  const end = Math.min(start + NEW_WINDOW_MINUTES, LATEST_END);
  return { start: localTimeOfMinutes(start), end: localTimeOfMinutes(end) };
}

export function TimeWindowList({
  id,
  label,
  windows,
  emptyLabel,
  disabled = false,
  onChange,
}: TimeWindowListProps) {
  const addition = nextWindow(windows);
  const canAdd = !disabled && addition !== null && windows.length < MAX_WINDOWS;

  const addButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={`Add ${label} window`}
      title="Add window"
      disabled={!canAdd}
      onClick={() => {
        if (addition !== null) onChange([...windows, addition]);
      }}
    >
      <PlusIcon />
    </Button>
  );

  if (windows.length === 0) {
    return (
      <div className="flex h-8 items-center gap-2">
        <span className="text-sm text-muted-foreground">{emptyLabel}</span>
        {addButton}
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5" aria-label={`${label} windows`}>
      {windows.map((window, index) => (
        // Keyed by the stored value as well as the position, so a row re-seeds
        // its drafts when the server hands back a merged or re-ordered list.
        <li
          key={`${index}:${window.start}-${window.end}`}
          className="flex flex-wrap items-center gap-2"
        >
          <WindowRow
            id={`${id}-${index}`}
            label={label}
            ordinal={index + 1}
            window={window}
            disabled={disabled}
            onCommit={(next) => onChange(windows.map((item, at) => (at === index ? next : item)))}
            onRemove={() => onChange(windows.filter((_, at) => at !== index))}
          />
          {index === windows.length - 1 ? addButton : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * One window's two fields and its remove button.
 *
 * Each field commits when the user is done with it — blur, or Enter — rather
 * than per keystroke, which for a time input is per digit: `"1"` on the way
 * to `"13:00"` is `01:00`, a value the user never meant and one that would
 * have been written, and possibly merged into the window before it, had the
 * change been sent as it happened. The same rule text fields follow
 * (`DurationInput`, the detail sheet's `CommittedInput`).
 *
 * A window whose end is not after its start is held, not sent: the row shows
 * it as invalid and waits for the other field, because moving a whole window
 * later means editing the start before the end and the intermediate state is
 * a normal step, not a mistake to toast about.
 */
function WindowRow({
  id,
  label,
  ordinal,
  window,
  disabled,
  onCommit,
  onRemove,
}: {
  id: string;
  label: string;
  ordinal: number;
  window: TimeWindow;
  disabled: boolean;
  onCommit: (window: TimeWindow) => void;
  onRemove: () => void;
}) {
  const [start, setStart] = React.useState<string>(window.start);
  const [end, setEnd] = React.useState<string>(window.end);
  /*
   * Escape leaves the field by calling `blur()`, which dispatches
   * *synchronously* — before React has re-rendered with the reset drafts — so
   * the `onBlur` that runs next is still the closure holding the time the user
   * just abandoned, and committing from it would persist exactly the edit
   * Escape threw away. A ref is the state the blur can read at the moment it
   * runs rather than at the render that built the handler; the guard sits in
   * `commit` itself because one `onKeyDown` serves both fields and both of
   * them blur into that one function. Cleared on focus so a flag left behind
   * by anything else can never swallow a real commit.
   */
  const abandoning = React.useRef(false);

  const startMinutes = minutesOfLocalTimeValue(start);
  const endMinutes = minutesOfLocalTimeValue(end);
  const complete = startMinutes !== null && endMinutes !== null;
  const backwards = complete && endMinutes <= startMinutes;

  function commit() {
    if (abandoning.current) {
      abandoning.current = false;
      return;
    }
    if (!complete || backwards) return;
    const next: TimeWindow = {
      start: localTimeOfMinutes(startMinutes),
      end: localTimeOfMinutes(endMinutes),
    };
    if (next.start === window.start && next.end === window.end) return;
    onCommit(next);
  }

  function reset() {
    setStart(window.start);
    setEnd(window.end);
  }

  function onFocus() {
    abandoning.current = false;
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    }
    if (event.key === "Escape") {
      // Abandon the edit rather than committing half of it.
      abandoning.current = true;
      reset();
      event.currentTarget.blur();
    }
  }

  // Wide enough for "09:00 AM" beside Chrome's picker glyph — at `w-28` the
  // meridiem's last letter sat under the icon and the field read "09:00 AN" —
  // and no wider, so a weekday row (label, two fields, dash, remove, add) still
  // fits the section's `max-w-md` on one line.
  const fieldClass = "w-30 tabular-nums";

  return (
    <>
      <Input
        id={`${id}-start`}
        type="time"
        step={STEP_SECONDS}
        value={start}
        disabled={disabled}
        aria-label={`${label} window ${ordinal} start`}
        className={fieldClass}
        onChange={(event) => setStart(event.target.value)}
        onFocus={onFocus}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      <span aria-hidden="true" className="text-muted-foreground">
        –
      </span>
      <Input
        id={`${id}-end`}
        type="time"
        step={STEP_SECONDS}
        value={end}
        disabled={disabled}
        aria-label={`${label} window ${ordinal} end`}
        aria-invalid={backwards || undefined}
        aria-describedby={backwards ? `${id}-end-error` : undefined}
        className={fieldClass}
        onChange={(event) => setEnd(event.target.value)}
        onFocus={onFocus}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove ${label} window ${ordinal}`}
        title="Remove window"
        disabled={disabled}
        onClick={onRemove}
      >
        <XIcon />
      </Button>
      {backwards ? (
        <span id={`${id}-end-error`} className="text-xs text-destructive">
          Has to end after it starts.
        </span>
      ) : null}
    </>
  );
}
