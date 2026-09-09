"use client";

import * as React from "react";
import { DragOverlay, useDraggable, useDroppable } from "@dnd-kit/core";

import { minutesFromY, snap, yFromMinutes } from "@momentum/core/calendar";
import { formatLocalDate } from "@momentum/core/time";
import type { Minutes } from "@momentum/core/types";
import { useAnnounce } from "@momentum/ui/components/announcer";
import { cn } from "@momentum/ui/lib/utils";

import {
  COLUMN_KEYBOARD_HINT,
  blockKeyboardHint,
  cancelledMessage,
  candidateMessage,
  createdMessage,
  cursorMessage,
  droppedMessage,
  formatSpan,
  moveModeMessage,
  resizeModeMessage,
  resizedMessage,
  unchangedMessage,
} from "@/features/calendar/announcements";
import {
  DEFAULT_TASK_BLOCK_MINUTES,
  blockDraggableId,
  dayDroppableId,
  resizeDraggableId,
  type BlockDragData,
  type DayDropData,
  type ResizeDragData,
} from "@/features/calendar/dnd";
import { isCompletable } from "@/features/calendar/projection";
import {
  CalendarInteractionContext,
  moveSpanByDays,
  moveSpanByMinutes,
  resizeSpanByMinutes,
  spanBetween,
  spanFromStart,
  spansEqual,
  useCalendarInteraction,
  type CalendarDndController,
  type CalendarInteraction,
} from "@/features/calendar/use-calendar-dnd";
import {
  columnFocusId,
  defaultCursorSpan,
  useGridCursor,
  type GridDirection,
} from "@/features/calendar/use-grid-cursor";
import type {
  BlockShellProps,
  CalendarSettings,
  DayColumnProps,
  DaySpan,
  ItemSegment,
} from "@/features/calendar/types";

/**
 * Everything the grid does: the droppable day column, the draggable block with
 * its resize handles, the keyboard move/resize modes, the grid cursor and the
 * drag ghost. Nothing here mutates until a commit; pointer and keyboard paths
 * produce the same span and hand it to the same callback.
 */

/** Matches the sensor's activation constraint, so a press reads the same either way. */
const DRAG_CREATE_THRESHOLD_PX = 4;

const COLUMN_HINT_ID = "calendar-column-keys";

const ARROW_DIRECTIONS: Record<string, GridDirection> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

/**
 * Provides the interaction context and renders the column keyboard hint once.
 * The hint is `hidden`, not `sr-only`: `aria-describedby` resolves hidden
 * text, and a visible-to-AT copy would be read again while arrowing.
 */
export function CalendarInteractionProvider({
  controller,
  children,
}: {
  controller: CalendarDndController;
  children: React.ReactNode;
}) {
  const cursor = useGridCursor();
  const { candidate, publishCandidate } = controller;

  const value = React.useMemo<CalendarInteraction>(
    () => ({ candidate, publishCandidate, cursor }),
    [candidate, publishCandidate, cursor],
  );

  return (
    <CalendarInteractionContext value={value}>
      {children}
      <span id={COLUMN_HINT_ID} hidden>
        {COLUMN_KEYBOARD_HINT}
      </span>
    </CalendarInteractionContext>
  );
}

/**
 * The only droppable, the drag-to-create surface and the home of the keyboard
 * cursor. Drag-to-create is deliberately not a dnd-kit sensor: it would
 * compete with the block sensors for activation.
 */
export function DayColumn({
  date,
  settings,
  isToday,
  className,
  children,
  callbacks,
  tabIndex,
}: DayColumnProps) {
  const interaction = useCalendarInteraction();
  const cursor = interaction?.cursor ?? null;
  const announce = useAnnounce();
  const spec = settings.spec;

  const data: DayDropData = { type: "day", date };
  const { setNodeRef, isOver } = useDroppable({ id: dayDroppableId(date), data });
  const nodeRef = React.useRef<HTMLDivElement | null>(null);
  const focusId = columnFocusId(date);

  // The drag-to-create selection. A ref as well, because `pointerup` may
  // arrive in the same frame as the move that last changed it.
  const [draft, setDraft] = React.useState<DaySpan | null>(null);
  const draftRef = React.useRef<DaySpan | null>(null);
  const anchor = React.useRef<{ pointerId: number; minutes: Minutes; clientY: number } | null>(
    null,
  );

  const attach = React.useCallback(
    (node: HTMLDivElement | null) => {
      nodeRef.current = node;
      setNodeRef(node);
    },
    [setNodeRef],
  );

  const register = cursor?.register;
  const noteFocus = cursor?.noteFocus;
  // A layout effect: its cleanup has to run while the node is still in the document.
  React.useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node || !register) return;
    const release = register({
      id: focusId,
      kind: "column",
      date,
      startMinutes: spec.dayStartMinutes,
      node,
    });
    // The grid's designated column is the starting tab stop, not whichever mounted first.
    if (tabIndex === 0) noteFocus?.(focusId, "column");
    return release;
  }, [register, noteFocus, focusId, date, spec.dayStartMinutes, tabIndex]);

  function setSelection(next: DaySpan | null) {
    draftRef.current = next;
    setDraft(next);
  }

  function minutesAt(clientY: number): Minutes | null {
    const node = nodeRef.current;
    if (!node) return null;
    return snap(minutesFromY(clientY - node.getBoundingClientRect().top, spec), spec);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    // Only the primary button, and only empty space; a press on a block is the block's.
    if (event.button !== 0 || event.ctrlKey) return;
    if (event.target !== event.currentTarget) return;
    const minutes = minutesAt(event.clientY);
    if (minutes === null) return;

    anchor.current = { pointerId: event.pointerId, minutes, clientY: event.clientY };
    setSelection(spanFromStart(date, minutes, DEFAULT_TASK_BLOCK_MINUTES, spec));
    // Capture, so a selection dragged past the column's edge keeps tracking.
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const start = anchor.current;
    if (!start || event.pointerId !== start.pointerId) return;
    if (Math.abs(event.clientY - start.clientY) < DRAG_CREATE_THRESHOLD_PX) return;
    const minutes = minutesAt(event.clientY);
    if (minutes === null) return;
    setSelection(spanBetween(date, start.minutes, minutes, spec));
  }

  function endSelection(event: React.PointerEvent<HTMLDivElement>, commit: boolean) {
    const start = anchor.current;
    if (!start || event.pointerId !== start.pointerId) return;
    anchor.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const span = draftRef.current;
    setSelection(null);
    // A press with no movement is a click, which creates a default-length block.
    if (commit && span) {
      callbacks.onCreateAt(span);
      announce(createdMessage(span));
    }
  }

  // With the pointer captured, Escape never lands on this element.
  React.useEffect(() => {
    if (draft === null) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      anchor.current = null;
      draftRef.current = null;
      setDraft(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [draft]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    // Keys pressed on a block inside this column are that block's.
    if (event.target !== event.currentTarget || !cursor) return;
    const current = cursor.cursor?.date === date ? cursor.cursor : defaultCursorSpan(date, spec);

    switch (event.key) {
      case "ArrowUp":
      case "ArrowDown": {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? spec.snapMinutes : -spec.snapMinutes;
        // Shift moves the end only: the cursor grows into a span.
        const next = event.shiftKey
          ? resizeSpanByMinutes(current, "end", step, spec)
          : moveSpanByMinutes(current, step, spec);
        cursor.setCursor(next);
        announce(cursorMessage(next));
        return;
      }
      case "ArrowLeft":
      case "ArrowRight": {
        const next = moveSpanByDays(current, event.key === "ArrowRight" ? 1 : -1);
        // Past the edge of the displayed range the keystroke does nothing.
        if (!cursor.focusDate(next.date)) return;
        event.preventDefault();
        cursor.setCursor(next);
        announce(cursorMessage(next));
        return;
      }
      case "Enter": {
        event.preventDefault();
        cursor.setCursor(current);
        callbacks.onCreateAt(current);
        announce(createdMessage(current));
        return;
      }
      case "Escape": {
        if (!cursor.cursor) return;
        event.preventDefault();
        cursor.setCursor(null);
        return;
      }
      default:
        return;
    }
  }

  function handleFocus(event: React.FocusEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || !cursor) return;
    cursor.noteFocus(focusId, "column");
    // Placing the cursor on focus is what makes it discoverable.
    if (cursor.cursor?.date !== date) cursor.setCursor(defaultCursorSpan(date, spec));
  }

  const selection = draft ?? (cursor?.cursor?.date === date ? cursor.cursor : null);
  const resolvedTabIndex = cursor
    ? cursor.isTabStop(focusId, "column")
      ? 0
      : -1
    : (tabIndex ?? 0);

  return (
    <div
      ref={attach}
      data-slot="day-column"
      data-today={isToday || undefined}
      data-over={isOver || undefined}
      // A focusable element needs a role before `aria-label` means anything;
      // `group` claims no grid semantics the markup does not have.
      role="group"
      tabIndex={resolvedTabIndex}
      aria-label={`${formatLocalDate(date, "long")}${isToday ? ", today" : ""}`}
      aria-describedby={COLUMN_HINT_ID}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => endSelection(event, true)}
      onPointerCancel={(event) => endSelection(event, false)}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      className={cn(
        "relative isolate focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        isToday && "bg-accent/40",
        isOver && "bg-accent/60",
        className,
      )}
    >
      {children}
      {selection ? <GridCursor span={selection} spec={settings.spec} /> : null}
    </div>
  );
}

/** The visible cursor: where Enter would create. Dashed so it never reads as an existing block. */
function GridCursor({ span, spec }: { span: DaySpan; spec: CalendarSettings["spec"] }) {
  const top = yFromMinutes(span.startMinutes, spec);
  return (
    <div
      aria-hidden="true"
      data-slot="grid-cursor"
      className="pointer-events-none absolute inset-x-0.5 rounded-md border-2 border-dashed border-primary/70 bg-primary/10"
      style={{ top, height: Math.max(yFromMinutes(span.endMinutes, spec) - top, 2) }}
    />
  );
}

type KeyboardMode = "move" | "resize";

function segmentSpan(segment: ItemSegment): DaySpan {
  return {
    date: segment.date,
    startMinutes: segment.startMinutes,
    endMinutes: segment.endMinutes,
  };
}

/** The block's interactive wrapper: draggable, focusable, resizable at both edges. */
export function BlockShell({
  segment,
  settings,
  callbacks,
  style,
  children,
  label,
  pending,
}: BlockShellProps) {
  const item = segment.item;
  const spec = settings.spec;
  const interaction = useCalendarInteraction();
  const cursor = interaction?.cursor ?? null;
  const publishCandidate = interaction?.publishCandidate;
  const announce = useAnnounce();
  const hintId = React.useId();
  const modeHintId = React.useId();
  const nodeRef = React.useRef<HTMLDivElement | null>(null);

  // A clipped half of a midnight-crossing block cannot be moved or resized in
  // place: dragging it would rewrite the whole block to the half's length.
  const adjustable = segment.isStart && segment.isEnd;

  // The same condition the pointer control uses, so both routes offer the same action.
  const completable = isCompletable(item);

  const [mode, setMode] = React.useState<KeyboardMode | null>(null);
  const [draft, setDraft] = React.useState<DaySpan | null>(null);
  const [grabOffsetY, setGrabOffsetY] = React.useState(0);

  const data: BlockDragData = {
    type: "block",
    itemId: item.id,
    title: item.title,
    durationMinutes: segment.endMinutes - segment.startMinutes,
    grabOffsetY,
    date: segment.date,
    startMinutes: segment.startMinutes,
  };

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: blockDraggableId(item.id),
    data,
    disabled: !adjustable,
  });

  const attach = React.useCallback(
    (node: HTMLDivElement | null) => {
      nodeRef.current = node;
      setNodeRef(node);
    },
    [setNodeRef],
  );

  const register = cursor?.register;
  // A layout effect because of its cleanup: the controller checks whether
  // this node is the active element, and a passive cleanup runs after the
  // node has left the document.
  React.useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node || !register) return;
    return register({
      id: segment.key,
      kind: "block",
      date: segment.date,
      startMinutes: segment.startMinutes,
      node,
    });
  }, [register, segment.key, segment.date, segment.startMinutes]);

  function publish(next: DaySpan | null) {
    publishCandidate?.(
      next === null ? null : { ...next, itemId: item.id, label: formatSpan(next) },
    );
  }

  function enterMode(next: KeyboardMode) {
    const span = segmentSpan(segment);
    setMode(next);
    setDraft(span);
    publish(span);
    announce(
      next === "move" ? moveModeMessage(item.title, span) : resizeModeMessage(item.title, span),
    );
  }

  function exitMode() {
    setMode(null);
    setDraft(null);
    publish(null);
  }

  function updateDraft(next: DaySpan) {
    setDraft(next);
    publish(next);
    announce(candidateMessage(next));
  }

  function commitMode() {
    const span = draft;
    const original = segmentSpan(segment);
    const current = mode;
    exitMode();
    if (!span) return;
    if (spansEqual(span, original)) {
      announce(unchangedMessage(item.title));
      return;
    }
    // The result is the board's to announce once the write has landed;
    // "unchanged" is not a write, so it is said at once.
    callbacks.onReschedule(
      item,
      span,
      current === "resize" ? resizedMessage(item.title, span) : droppedMessage(item.title, span),
    );
  }

  function cancelMode() {
    if (!mode) return;
    exitMode();
    announce(cancelledMessage(item.title));
  }

  function handleModeKey(event: React.KeyboardEvent<HTMLDivElement>, span: DaySpan): boolean {
    switch (event.key) {
      case "ArrowUp":
      case "ArrowDown": {
        const sign = event.key === "ArrowDown" ? 1 : -1;
        if (mode === "move") {
          // Shift is the coarse step: an hour.
          updateDraft(
            moveSpanByMinutes(span, sign * (event.shiftKey ? 60 : spec.snapMinutes), spec),
          );
        } else {
          updateDraft(
            resizeSpanByMinutes(
              span,
              event.shiftKey ? "start" : "end",
              sign * spec.snapMinutes,
              spec,
            ),
          );
        }
        return true;
      }
      case "ArrowLeft":
      case "ArrowRight": {
        // A resize is anchored to its day; only a move crosses columns.
        if (mode !== "move") return false;
        const moved = moveSpanByDays(span, event.key === "ArrowRight" ? 1 : -1);
        // Stop at the edge of the displayed range, or the pending span walks
        // off the week with no outline to show it and Enter commits it unseen.
        if (cursor && !cursor.hasDate(moved.date)) return true;
        updateDraft(moved);
        return true;
      }
      case "Enter":
        commitMode();
        return true;
      case "Escape":
        cancelMode();
        return true;
      default:
        return false;
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;

    if (mode && draft) {
      if (!handleModeKey(event, draft)) return;
      event.preventDefault();
      // In a mode the block owns Escape and the arrows; bubbling would close a
      // surrounding sheet or scroll the grid.
      event.stopPropagation();
      return;
    }

    switch (event.key) {
      case "Enter":
        event.preventDefault();
        callbacks.onOpenItem(item);
        return;
      case " ":
        if (!completable) return;
        event.preventDefault();
        callbacks.onToggleComplete(item);
        return;
      case "Delete":
      case "Backspace":
        event.preventDefault();
        callbacks.onDelete(item);
        return;
      case "m":
      case "M":
        if (!adjustable) return;
        event.preventDefault();
        enterMode("move");
        return;
      case "r":
      case "R":
        if (!adjustable) return;
        event.preventDefault();
        enterMode("resize");
        return;
      default: {
        const direction = ARROW_DIRECTIONS[event.key];
        if (!direction || !cursor) return;
        if (cursor.focusNeighbour(segment.key, "block", direction)) event.preventDefault();
      }
    }
  }

  const tabIndex = cursor ? (cursor.isTabStop(segment.key, "block") ? 0 : -1) : 0;

  // dnd-kit's own description is merged, not replaced, so its drag
  // instructions keep being announced — except on a clipped half, which has no drag.
  const describedBy = [
    adjustable ? attributes["aria-describedby"] : null,
    hintId,
    mode && modeHintId,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={attach}
      {...attributes}
      {...listeners}
      data-slot="block-shell"
      // Capture phase, so recording the grab offset cannot displace dnd-kit's
      // own `onPointerDown` listener.
      onPointerDownCapture={(event) =>
        setGrabOffsetY(event.clientY - event.currentTarget.getBoundingClientRect().top)
      }
      // `group`, not `button`: a `button`'s children are presentational, which
      // would flatten away the nested completion button (axe `nested-interactive`).
      role="group"
      tabIndex={tabIndex}
      aria-label={label}
      // dnd-kit writes `aria-disabled` and `aria-roledescription="draggable"`
      // into `attributes` even when disabled. A clipped half is disabled for
      // dragging only, so both are overridden after the spread.
      aria-disabled={undefined}
      aria-roledescription={adjustable ? attributes["aria-roledescription"] : undefined}
      // `aria-grabbed` is deprecated; `aria-pressed` only while held, so an idle
      // block is not announced as a toggle button.
      aria-pressed={mode !== null || isDragging ? true : undefined}
      aria-describedby={describedBy}
      aria-busy={pending || undefined}
      data-dragging={isDragging || undefined}
      data-mode={mode ?? undefined}
      style={style}
      onClick={() => callbacks.onOpenItem(item)}
      onKeyDown={handleKeyDown}
      onFocus={(event) => {
        if (event.target === event.currentTarget) cursor?.noteFocus(segment.key, "block");
      }}
      // Focus leaving mid-mode is a cancellation.
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        cancelMode();
      }}
      className={cn(
        // `touch-manipulation`, not `touch-none`: the touch sensor is
        // press-and-hold, so a swipe that begins on a block must still scroll.
        "absolute touch-manipulation focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        isDragging && "opacity-50",
        mode !== null && "ring-3 ring-ring/50",
      )}
    >
      {children}
      {adjustable ? (
        <>
          <ResizeHandle segment={segment} edge="start" />
          <ResizeHandle segment={segment} edge="end" />
        </>
      ) : null}
      {/* This block's own keys; which of them work depends on the block. */}
      <span id={hintId} hidden>
        {blockKeyboardHint({ adjustable, completable })}
      </span>
      {mode === null ? null : (
        <span id={modeHintId} hidden>
          {mode === "move" ? moveModeMessage(item.title, draft ?? segmentSpan(segment)) : null}
          {mode === "resize" ? resizeModeMessage(item.title, draft ?? segmentSpan(segment)) : null}
        </span>
      )}
    </div>
  );
}

/** One edge of a block; its own draggable so the payload says which edge moved. */
function ResizeHandle({ segment, edge }: { segment: ItemSegment; edge: "start" | "end" }) {
  const data: ResizeDragData = {
    type: "resize",
    itemId: segment.item.id,
    title: segment.item.title,
    edge,
    date: segment.date,
    startMinutes: segment.startMinutes,
    endMinutes: segment.endMinutes,
  };
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: resizeDraggableId(segment.item.id, edge),
    data,
  });

  return (
    <span
      ref={setNodeRef}
      data-slot="resize-handle"
      // Pointer affordances only; the keyboard reaches the same operation through `R`.
      aria-hidden="true"
      className={cn(
        "absolute inset-x-0 h-1.5 cursor-ns-resize touch-none",
        edge === "start" ? "top-0" : "bottom-0",
      )}
      onClick={(event) => event.stopPropagation()}
      {...listeners}
      {...attributes}
      tabIndex={-1}
    />
  );
}

/**
 * The ghost that follows the pointer. No drop animation: the block is
 * rescheduled optimistically, so the ghost would animate back to a stale
 * position. dnd-kit sets the overlay's z-index inline; a `z-*` utility would be overridden.
 */
export function CalendarDragLayer({ children }: { children?: React.ReactNode }) {
  return (
    <DragOverlay dropAnimation={null} className="pointer-events-none">
      {children}
    </DragOverlay>
  );
}
