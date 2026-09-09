import { formatDuration, formatLocalDate, formatMinutesOfDay } from "@momentum/core/time";

import type { DaySpan } from "@/features/calendar/types";

/**
 * Every string the calendar speaks, built in one place.
 *
 * Two channels consume these and neither invents wording of its own: dnd-kit's
 * `accessibility.announcements` covers the pointer drag lifecycle (the library
 * renders that live region whether we use it or not), and `useAnnounce()` — the
 * application's single live region — covers the keyboard modes, the grid cursor
 * and mutation results, which dnd-kit knows nothing about. Splitting by
 * interaction modality rather than by event is what keeps one action from being
 * spoken twice out of two regions.
 *
 * Times are formatted through `@momentum/core/time` (Domain Rule 5); a raw
 * pixel offset or an ISO instant never reaches a listener.
 */

/**
 * Spoken times read the way the page does — 24-hour, as the gutter, the
 * block labels and Today's rows all are — so a listener hears "07:15" where
 * a sighted user reads 07:15, and one clock is never translated into another
 * mid-sentence.
 */
const SPOKEN_TIME = { hour12: false } as const;

const EN_DASH = "–";

/**
 * How often a moving candidate may be announced. A drag produces a pointer
 * event per frame; announcing each one produces speech that never finishes a
 * sentence, and the position is already visible in the placeholder.
 */
export const CANDIDATE_ANNOUNCE_INTERVAL_MS = 500;

/** "Tue Sep 8, 09:00 – 10:00". The one reading of a span, used everywhere. */
export function formatSpan(span: DaySpan): string {
  const day = `${formatLocalDate(span.date, "weekday")} ${formatLocalDate(span.date, "monthDay")}`;
  const from = formatMinutesOfDay(span.startMinutes, SPOKEN_TIME);
  const to = formatMinutesOfDay(span.endMinutes, SPOKEN_TIME);
  return `${day}, ${from} ${EN_DASH} ${to}`;
}

/** The same, with the length appended — for spans whose duration is the point. */
export function formatSpanWithDuration(span: DaySpan): string {
  return `${formatSpan(span)}, ${formatDuration(span.endMinutes - span.startMinutes)}`;
}

export function pickedUpMessage(title: string, span: DaySpan | null): string {
  return span === null ? `Picked up ${title}.` : `Picked up ${title}, ${formatSpan(span)}.`;
}

export function candidateMessage(span: DaySpan): string {
  return formatSpanWithDuration(span);
}

export function droppedMessage(title: string, span: DaySpan): string {
  return `Moved ${title} to ${formatSpan(span)}.`;
}

export function resizedMessage(title: string, span: DaySpan): string {
  return `${title} is now ${formatSpanWithDuration(span)}.`;
}

export function scheduledMessage(title: string, span: DaySpan): string {
  return `Scheduled ${title} for ${formatSpanWithDuration(span)}.`;
}

/** Nothing was mutated, so the wording says so rather than implying a write. */
export function cancelledMessage(title: string): string {
  return `Cancelled. ${title} is unchanged.`;
}

export function unchangedMessage(title: string): string {
  return `${title} is unchanged.`;
}

export function moveModeMessage(title: string, span: DaySpan): string {
  return `Moving ${title}, ${formatSpan(span)}. ${MOVE_MODE_HINT}`;
}

export function resizeModeMessage(title: string, span: DaySpan): string {
  return `Resizing ${title}, ${formatSpanWithDuration(span)}. ${RESIZE_MODE_HINT}`;
}

export function cursorMessage(span: DaySpan): string {
  return `${formatSpanWithDuration(span)}. Press Enter to create a block.`;
}

export function createdMessage(span: DaySpan): string {
  return `Creating a block, ${formatSpanWithDuration(span)}.`;
}

/*
 * What the board says once a mutation has actually landed.
 *
 * The interaction layer announces the gesture — picked up, moved to, cancelled
 * — because it is the thing that knows about gestures. Only the board knows
 * whether the write succeeded, so the wording here is about the result and
 * never about the drag. A failure needs no builder: the toast carries the
 * server's own message and sonner announces it.
 */

export function savedMessage(title: string): string {
  return `${title} saved.`;
}

export function addedMessage(title: string): string {
  return `${title} added.`;
}

export function deletedMessage(title: string): string {
  return `${title} deleted.`;
}

/** Undo put a deleted block back, and it is on the board again. */
export function restoredMessage(title: string): string {
  return `${title} restored.`;
}

/** A cancelled override, not a deleted row — the series still owns the slot. */
export function occurrenceRemovedMessage(title: string): string {
  return `${title} removed from this week.`;
}

/**
 * Domain Rule 13's four outcomes, said plainly. "Block done" rather than
 * "task done" matters: the difference between the two is the whole reason the
 * control has two labels.
 */
export function completionMessage(name: string, completed: boolean, alsoTask: boolean): string {
  if (completed) return alsoTask ? `${name} completed.` : `Block done. ${name} is still open.`;
  return alsoTask ? `${name} reopened.` : `Block marked as not done.`;
}

/**
 * The same event for a habit block, which records the habit's day as well as
 * the span (Phase 6, Domain Rule 14).
 *
 * Un-recording says what was undone and nothing about the habit itself: a day
 * that was not recorded is a fact, never a judgement (Domain Rule 7).
 */
export function habitCompletionMessage(name: string, completed: boolean): string {
  return completed ? `${name} recorded for that day.` : `${name} no longer recorded for that day.`;
}

/**
 * The keyboard model has to be discoverable or it is not an alternative to
 * dragging, only a secret (Domain Rule 10). These are the accessible
 * descriptions of a block and of the grid, not live-region text.
 */

/**
 * One block's keys, composed rather than fixed, because this is that block's
 * own description and the keys differ per block: `M` and `R` do nothing on a
 * clipped half of a midnight-crossing block, and Space does nothing on an
 * event, which has no completion state (Domain Rule 13). A description that
 * promises a key the element does not implement is the same defect as an
 * undiscoverable keyboard model, only inverted — the user is told to press
 * something and gets silence.
 */
export function blockKeyboardHint(block: { adjustable: boolean; completable: boolean }): string {
  const keys = [
    ...(block.adjustable ? ["M to move", "R to resize"] : []),
    "Enter to open",
    ...(block.completable ? ["Space to complete"] : []),
    "Delete to remove",
  ];
  const hint = `Press ${keys.join(", ")}. Arrow keys move between blocks.`;
  // Why the move and resize keys are missing, said once, where the user is
  // looking for them — the limitation itself is docs/ROADMAP.md's.
  return block.adjustable
    ? hint
    : `${hint} This block crosses midnight; change its times in the editor.`;
}

export const MOVE_MODE_HINT =
  "Up and Down move by one increment, Shift with them by an hour, Left and Right by a day. " +
  "Enter commits, Escape cancels.";

export const RESIZE_MODE_HINT =
  "Up and Down adjust the end, Shift with them adjusts the start. Enter commits, Escape cancels.";

export const COLUMN_KEYBOARD_HINT =
  "Arrow keys move the time cursor, Shift with Up and Down extends the selection, " +
  "Enter creates a block, Escape clears the cursor.";

/** dnd-kit's `screenReaderInstructions.draggable`, read when a drag handle takes focus. */
export const CALENDAR_DRAG_INSTRUCTIONS =
  "To move this block with the keyboard, press M and use the arrow keys, then Enter to " +
  "commit or Escape to cancel. Press R to resize it the same way.";
