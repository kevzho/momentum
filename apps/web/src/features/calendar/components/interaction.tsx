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
 * Everything the grid *does*, as opposed to what it looks like: the droppable
 * day column, the draggable block with its resize handles, the keyboard move
 * and resize modes, the grid cursor, and the drag ghost.
 *
 * Two rules shape all of it (docs/ARCHITECTURE.md §9). Nothing here computes a
 * pixel-to-minute conversion — every one comes from `@momentum/core/calendar`
 * through the helpers in `use-calendar-dnd.ts`. And nothing here mutates until
 * a commit: an interaction publishes a *candidate* span, the grid draws it, and
 * only Enter or a drop calls a callback, which is why Escape is always a no-op
 * on data and why the pointer and keyboard paths cannot drift apart — they
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

/* -------------------------------------------------------------------------- */
/* Provider                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Wraps the grid inside the board's `DndContext` and gives the columns and
 * blocks the two things they cannot receive as props: somewhere to publish a
 * keyboard candidate so it renders through the same placeholder as a pointer
 * drag, and the grid-wide cursor and roving focus.
 *
 * It also renders the column keyboard hint, which is one string for all seven.
 * It is `hidden`, not `sr-only`: `aria-describedby` resolves the text of a
 * hidden element, and a visible-to-AT copy would be read again while arrowing
 * through the grid. A block's hint is not here — it describes that block's own
 * keys, so `BlockShell` renders one each.
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

/* -------------------------------------------------------------------------- */
/* Day column                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The column the pointer resolves a time against: the only droppable in the
 * calendar (seven nodes, not five hundred slot cells), the drag-to-create
 * surface, and the home of the keyboard cursor.
 *
 * Drag-to-create is deliberately not a dnd-kit sensor (§9 step 5). A sensor on
 * the column would compete with the block sensors for activation, and the
 * 4px threshold that keeps a click a click would have to be reproduced anyway.
 * A pointer-down/move/up handler with pointer capture is smaller and does not
 * interact with the drag system at all.
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

  /** The pointer drag-to-create selection. A ref as well, because `pointerup` may
   * arrive in the same frame as the move that last changed it. */
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
  // A layout effect for the same reason as the block's: its cleanup has to run
  // while the node is still in the document.
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
    // The grid designates which column Tab lands on; roving takes over from
    // there, so its choice is honoured as the starting point rather than
    // overruled by whichever column happened to mount first.
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
    // Only the primary button, and only empty space: a press that landed on a
    // block belongs to that block's drag sensor.
    if (event.button !== 0 || event.ctrlKey) return;
    if (event.target !== event.currentTarget) return;
    const minutes = minutesAt(event.clientY);
    if (minutes === null) return;

    anchor.current = { pointerId: event.pointerId, minutes, clientY: event.clientY };
    setSelection(spanFromStart(date, minutes, DEFAULT_TASK_BLOCK_MINUTES, spec));
    // Capture, so a selection dragged past the column's edge keeps tracking
    // instead of ending wherever the pointer left.
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
    // A press with no movement is a click, and a click on empty space creates a
    // default-length block at the clicked time — the same span the preview drew.
    if (commit && span) {
      callbacks.onCreateAt(span);
      announce(createdMessage(span));
    }
  }

  // Escape has to reach a selection whose pointer is captured, and a captured
  // pointer means the keystroke never lands on this element.
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
        // Shift moves the end only: the cursor grows into a span, which is the
        // keyboard equivalent of dragging vertically on empty space.
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
        // Only follow the cursor to a day the grid is actually showing; past
        // the edge of the range the keystroke does nothing rather than hiding
        // the cursor on a column that is not rendered.
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
    // Placing the cursor on focus is what makes it discoverable: the affordance
    // is visible before the user has guessed that the arrows do something.
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
      // A focusable element needs a role before `aria-label` means anything,
      // and ARIA has no role for "a surface you drop things onto". `group` is
      // the honest one: it names the column and carries the key hints as its
      // description, without claiming grid semantics the markup does not have.
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

/**
 * The visible cursor: where Enter would create, and how far a Shift+Down
 * selection has grown. Dashed rather than solid so it never reads as a block
 * that already exists.
 */
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

/* -------------------------------------------------------------------------- */
/* Block                                                                      */
/* -------------------------------------------------------------------------- */

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

  /**
   * Only a block that both starts and ends inside this column can be moved or
   * resized in place. A midnight-crossing block renders as two segments, and
   * dragging the clipped half would rewrite the whole block to the length of
   * the half the user grabbed. Those are edited through the editor instead.
   */
  const adjustable = segment.isStart && segment.isEnd;

  /** Events have no completion state (Domain Rule 13), so Space does nothing on one. */
  // Events have no completion state (Domain Rule 13). A habit block has one
  // only while its day is inside the recording window, or while it is already
  // done and the keystroke would undo it — the same condition the pointer
  // control uses, so the keyboard route and the pointer route offer the same
  // action (Domain Rule 10).
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
  /*
   * A layout effect, not a passive one, because of its cleanup. The controller
   * hands focus on when the focused block unmounts — to the block that remounts
   * under the same item on another day, or to a neighbour when the block was
   * deleted — and it decides whether to by asking if this node is the active
   * element. A passive cleanup runs after React has already taken the node out
   * of the document, when the active element is `<body>` and the answer is
   * always no; a layout cleanup runs during the commit, while the node is still
   * attached and still focused.
   */
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
    // The result is the board's to announce, once the write has landed: said
    // here it would be spoken before the server agreed and stand uncorrected
    // when the block rolled back (Domain Rule 11). "Unchanged" above is not a
    // write, so it is said at once.
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
          // Shift is the coarse step: an hour, so crossing a morning does not
          // take sixteen keypresses at the default increment.
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
        // A resize is anchored to its day; only a move crosses columns, and it
        // carries the duration across unchanged.
        if (mode !== "move") return false;
        const moved = moveSpanByDays(span, event.key === "ArrowRight" ? 1 : -1);
        // Stop at the edge of the displayed range, exactly as the grid cursor
        // does. Without this the candidate outline has no column to render in,
        // so the block appears not to move while its pending span walks off the
        // week — and Enter would then commit it somewhere the user never saw.
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
      // While a mode is active the block owns Escape and the arrows; letting
      // them bubble would close a surrounding sheet or scroll the grid instead.
      event.stopPropagation();
      return;
    }

    switch (event.key) {
      case "Enter":
        event.preventDefault();
        callbacks.onOpenItem(item);
        return;
      case " ":
        // Events have no completion state (Domain Rule 13); the key is left to
        // the page rather than pretending to do something, and the block's hint
        // does not offer it.
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

  /**
   * dnd-kit's own description carries the pointer-drag instructions, so it is
   * merged rather than replaced: overwriting `aria-describedby` after spreading
   * `attributes` is how those instructions silently stop being announced. It is
   * dropped for a clipped half, though — dnd-kit emits its id whether or not
   * the draggable is disabled, and those instructions are about a drag this
   * segment does not have.
   */
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
      // Capture phase, and a different prop from the sensor's `onPointerDown`,
      // so recording where the block was grabbed cannot displace dnd-kit's own
      // listener. Without the offset a block dropped by its middle jumps upward
      // by however far down the user happened to grab it.
      onPointerDownCapture={(event) =>
        setGrabOffsetY(event.clientY - event.currentTarget.getBoundingClientRect().top)
      }
      /*
       * `group`, not `button`. A work block contains a real completion button,
       * and ARIA makes a `button`'s children presentational — nesting one
       * flattens away its role and its Domain Rule 13 name, which axe reports
       * as `nested-interactive` and a screen-reader user experiences as a
       * control that is not there. A focusable group with a label and a
       * described keyboard model is what this actually is: a composite, not a
       * single action.
       */
      role="group"
      tabIndex={tabIndex}
      aria-label={label}
      /*
       * dnd-kit writes `aria-disabled` into `attributes` whenever the draggable
       * is disabled, and a clipped half of a midnight-crossing block is
       * disabled *for dragging only* — it can still be opened, completed and
       * deleted. Announcing it as disabled would be a lie about the whole
       * block, so the attribute is overridden here, after the spread, and the
       * limitation is carried by this block's own hint below, which names it
       * and leaves out the two keys that do nothing.
       *
       * `aria-roledescription` goes with it: dnd-kit sets it to "draggable"
       * from the same memoized object, disabled or not, and a segment that
       * cannot be dragged by pointer or keyboard should not announce itself as
       * one.
       */
      aria-disabled={undefined}
      aria-roledescription={adjustable ? attributes["aria-roledescription"] : undefined}
      // The honest reading of "this block is currently held": `aria-grabbed` is
      // deprecated, and `aria-pressed` is present only while the block is
      // actually held, so an idle block is not announced as a toggle button.
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
      // Focus leaving mid-mode is a cancellation, exactly as a pointer leaving
      // the window is (docs/ARCHITECTURE.md §9 step 4).
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        cancelMode();
      }}
      className={cn(
        /*
         * `touch-manipulation`, not `touch-none`: the touch sensor picks a block
         * up on a press-and-hold, and until the hold completes the browser
         * keeps the gesture — a swipe that begins on a block still scrolls the
         * grid. `none` would make every block a dead zone for scrolling; `auto`
         * would let the browser claim the drag itself. Double-tap zoom is the
         * one gesture given up, which is what makes a tap open the editor
         * without the browser's tap delay.
         */
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
      {/* This block's own keys, not the grid's: which of them work depends on
          the block. `hidden` for the same reason the column's hint is. */}
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

/**
 * One edge of a block. It is its own draggable rather than a mode of the block
 * so that the payload says which edge moved; `resolveResize` then anchors the
 * other one and a resize can never become an accidental move.
 */
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
      // The handles are pointer affordances; the keyboard reaches the same
      // operation through the block's `R` mode, so they are not tab stops and
      // are hidden from the accessibility tree rather than duplicated in it.
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

/* -------------------------------------------------------------------------- */
/* Drag ghost                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The ghost that follows the pointer. The drop animation is off: the block is
 * rescheduled optimistically, so animating the ghost back to where the block
 * used to be would show the old position winning a race it already lost.
 *
 * dnd-kit sets the overlay's z-index inline, above every layer in the token
 * scale, which is what a ghost wants; a `z-*` utility here would be overridden
 * and read as a decision that had no effect.
 */
export function CalendarDragLayer({ children }: { children?: React.ReactNode }) {
  return (
    <DragOverlay dropAnimation={null} className="pointer-events-none">
      {children}
    </DragOverlay>
  );
}
