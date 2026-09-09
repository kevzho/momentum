import { formatDuration, formatLocalDate, formatMinutesOfDay } from "@momentum/core/time";

import type { DaySpan } from "@/features/calendar/types";

/**
 * Every string the calendar speaks. dnd-kit's `accessibility.announcements`
 * covers the pointer drag lifecycle; `useAnnounce()` covers keyboard modes, the
 * grid cursor and mutation results. Split by modality so nothing is spoken twice.
 */

// 24-hour, matching the gutter and block labels.
const SPOKEN_TIME = { hour12: false } as const;

const EN_DASH = "–";

/** How often a moving candidate may be announced; per-frame speech never finishes a sentence. */
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

// Mutation results, spoken by the board once the write has landed. Failures
// need no builder: the toast carries the server's message.

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

/** "Block done" rather than "task done": the distinction is why the control has two labels. */
export function completionMessage(name: string, completed: boolean, alsoTask: boolean): string {
  if (completed) return alsoTask ? `${name} completed.` : `Block done. ${name} is still open.`;
  return alsoTask ? `${name} reopened.` : `Block marked as not done.`;
}

/** Un-recording states the fact and passes no judgement on the habit (Domain Rule 7). */
export function habitCompletionMessage(name: string, completed: boolean): string {
  return completed ? `${name} recorded for that day.` : `${name} no longer recorded for that day.`;
}

/**
 * A block's accessible description (not live-region text). Composed per block:
 * `M`/`R` do nothing on a clipped half of a midnight-crossing block and Space
 * does nothing on an event, and a hint must never promise an unimplemented key.
 */
export function blockKeyboardHint(block: { adjustable: boolean; completable: boolean }): string {
  const keys = [
    ...(block.adjustable ? ["M to move", "R to resize"] : []),
    "Enter to open",
    ...(block.completable ? ["Space to complete"] : []),
    "Delete to remove",
  ];
  const hint = `Press ${keys.join(", ")}. Arrow keys move between blocks.`;
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
