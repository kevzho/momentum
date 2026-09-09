"use client";

import * as React from "react";
import {
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type ScreenReaderInstructions,
} from "@dnd-kit/core";

import {
  MIN_BLOCK_MINUTES,
  clampSpan,
  resolveDrop,
  resolveResize,
  shiftSpan,
  type GridSpec,
} from "@momentum/core/calendar";
import { addDays } from "@momentum/core/time";
import type { Minutes } from "@momentum/core/types";

import {
  CALENDAR_DRAG_INSTRUCTIONS,
  CANDIDATE_ANNOUNCE_INTERVAL_MS,
  cancelledMessage,
  candidateMessage,
  droppedMessage,
  formatSpan,
  pickedUpMessage,
  resizedMessage,
  scheduledMessage,
  unchangedMessage,
} from "@/features/calendar/announcements";
import { asDayDropData, asDragData, type DragData } from "@/features/calendar/dnd";
import type { GridCursorController } from "@/features/calendar/use-grid-cursor";
import type {
  CalendarCallbacks,
  CalendarItem,
  CalendarSettings,
  CandidateSpan,
  DaySpan,
} from "@/features/calendar/types";

/**
 * The pointer half of the calendar's interaction model (docs/ARCHITECTURE.md §9).
 *
 * The controller returned by `useCalendarDnd` is everything one `DndContext`
 * needs. It owns no geometry of its own: every pixel-to-minute question is
 * answered by `@momentum/core/calendar`, and the two functions at the top of
 * this file — `pointerYWithin` and `resolveCandidateSpan` — are the whole of
 * the maths, kept pure so the drop behaviour can be tested without a browser,
 * a layout engine or a rendered grid.
 *
 * Nothing here mutates. A drag publishes a *candidate* span that the grid draws
 * as a placeholder, and only `onDragEnd` calls a callback. That is what makes
 * Escape free (§9 step 4): there is no write to undo.
 */

/* -------------------------------------------------------------------------- */
/* The maths                                                                  */
/* -------------------------------------------------------------------------- */

/** Where the pointer is in the viewport, tracked for the length of a drag. */
export interface PointerPosition {
  x: number;
  y: number;
}

/**
 * The pointer's offset inside a day column.
 *
 * From the live pointer position when one is known: `over.rect` is dnd-kit's
 * `Rect`, whose `top` follows the column's own scroll container, so the
 * viewport position minus it is the column offset however far the grid has
 * scrolled since the drag began.
 *
 * The fallback — where the pointer started plus dnd-kit's `delta` — is only
 * right when the dragged element and the column share a scroll container.
 * `delta` is *scroll-adjusted* across the scrollable ancestors of whichever
 * node is currently over, so a task dragged out of the Plan panel's scroller
 * onto the grid's scroller carries the panel's scroll offset in `delta.y` and
 * lands that many pixels away from the pointer. That is why the controller
 * tracks the pointer itself and this only falls back to `delta` when it has
 * nothing better (an activation that carried no coordinates).
 *
 * Null when neither is available; the caller keeps the previous candidate
 * rather than inventing a position.
 */
export function pointerYWithin(
  columnTop: number,
  pointer: PointerPosition | null,
  activatorEvent: Event | null,
  deltaY: number,
): number | null {
  if (pointer !== null) return pointer.y - columnTop;
  const origin = coordinatesOf(activatorEvent);
  return origin === null ? null : origin.y + deltaY - columnTop;
}

/** The viewport coordinates an activation event carried, for a mouse, a pen or a finger. */
export function coordinatesOf(event: Event | null): PointerPosition | null {
  if (event === null) return null;
  if ("clientX" in event && "clientY" in event) {
    const { clientX, clientY } = event;
    if (typeof clientX === "number" && typeof clientY === "number") {
      return { x: clientX, y: clientY };
    }
    return null;
  }
  if (typeof TouchEvent !== "undefined" && event instanceof TouchEvent) {
    const touch = event.touches.item(0);
    return touch === null ? null : { x: touch.clientX, y: touch.clientY };
  }
  return null;
}

export interface CandidateInput {
  drag: DragData;
  /** The day column the pointer is over. */
  date: DaySpan["date"];
  /** Pointer offset from the top of that column, in pixels. */
  pointerY: number;
  spec: GridSpec;
}

/**
 * Where an in-flight drag would land.
 *
 * A move and a task drop are the same operation — place a known duration under
 * the pointer — and differ only in the grab offset, which is zero for a task
 * because the pointer never grabbed a rendered block. A resize is anchored: it
 * keeps the day it started on however far sideways the pointer wanders, because
 * its opposite edge is a fixed time on that day and letting the column change
 * would silently turn a resize into a move to another day.
 */
export function resolveCandidateSpan({ drag, date, pointerY, spec }: CandidateInput): DaySpan {
  if (drag.type === "resize") {
    const span = resolveResize({
      edge: drag.edge,
      pointerY,
      original: { start: drag.startMinutes, end: drag.endMinutes },
      spec,
    });
    return { date: drag.date, startMinutes: span.start, endMinutes: span.end };
  }

  const span = resolveDrop({
    pointerY,
    grabOffsetY: drag.type === "block" ? drag.grabOffsetY : 0,
    durationMinutes: drag.durationMinutes,
    spec,
  });
  return { date, startMinutes: span.start, endMinutes: span.end };
}

/** Keyboard move by minutes. Duration is preserved; `shiftSpan` does not re-snap (§9). */
export function moveSpanByMinutes(span: DaySpan, delta: Minutes, spec: GridSpec): DaySpan {
  const moved = shiftSpan({ start: span.startMinutes, end: span.endMinutes }, delta, spec);
  return { date: span.date, startMinutes: moved.start, endMinutes: moved.end };
}

/** Keyboard move across columns. The wall-clock time is untouched, so the duration survives. */
export function moveSpanByDays(span: DaySpan, days: number): DaySpan {
  return { ...span, date: addDays(span.date, days) };
}

/**
 * Keyboard resize by minutes.
 *
 * The pointer path goes through `resolveResize`, which takes a pixel position;
 * a keystroke has none, so this is its minute-space equivalent and keeps the
 * same two rules: only the named edge moves, and the span never shrinks past
 * `minMinutes` or inverts.
 */
export function resizeSpanByMinutes(
  span: DaySpan,
  edge: "start" | "end",
  delta: Minutes,
  spec: GridSpec,
  minMinutes: Minutes = MIN_BLOCK_MINUTES,
): DaySpan {
  const floor = Math.min(minMinutes, Math.max(0, spec.dayEndMinutes - spec.dayStartMinutes));
  if (edge === "end") {
    const end = clamp(span.endMinutes + delta, span.startMinutes + floor, spec.dayEndMinutes);
    return { ...span, endMinutes: end };
  }
  const start = clamp(span.startMinutes + delta, spec.dayStartMinutes, span.endMinutes - floor);
  return { ...span, startMinutes: start };
}

/** A create span from one time, used by the grid cursor and by a click on empty space. */
export function spanFromStart(
  date: DaySpan["date"],
  startMinutes: Minutes,
  durationMinutes: Minutes,
  spec: GridSpec,
): DaySpan {
  const span = clampSpan(startMinutes, durationMinutes, spec);
  return { date, startMinutes: span.start, endMinutes: span.end };
}

/**
 * The span between two snapped times, in either drag direction.
 *
 * Drag-to-create runs upward as readily as downward, so the anchor is whichever
 * end the pointer started at rather than the earlier one. A span never comes
 * out shorter than the floor: a 3px drag is a click, and a click creates a
 * block, not a zero-length one.
 */
export function spanBetween(
  date: DaySpan["date"],
  anchorMinutes: Minutes,
  pointerMinutes: Minutes,
  spec: GridSpec,
  minMinutes: Minutes = MIN_BLOCK_MINUTES,
): DaySpan {
  const low = Math.min(anchorMinutes, pointerMinutes);
  const high = Math.max(anchorMinutes, pointerMinutes);
  return spanFromStart(date, low, Math.max(high - low, minMinutes), spec);
}

export function spansEqual(a: DaySpan, b: DaySpan): boolean {
  return a.date === b.date && a.startMinutes === b.startMinutes && a.endMinutes === b.endMinutes;
}

/** The span a drag payload started from. Null for a task, which had none. */
export function originalSpanOf(drag: DragData): DaySpan | null {
  if (drag.type === "task") return null;
  if (drag.type === "block") {
    return {
      date: drag.date,
      startMinutes: drag.startMinutes,
      endMinutes: drag.startMinutes + drag.durationMinutes,
    };
  }
  return { date: drag.date, startMinutes: drag.startMinutes, endMinutes: drag.endMinutes };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

/* -------------------------------------------------------------------------- */
/* The controller                                                             */
/* -------------------------------------------------------------------------- */

export interface ActiveDrag {
  data: DragData;
  /** The item being dragged, or null for a task coming out of the Plan panel. */
  item: CalendarItem | null;
}

export interface CalendarDndOptions {
  settings: CalendarSettings;
  callbacks: CalendarCallbacks;
  /** The week's items, so a drag payload's id can be resolved back to its object. */
  items: readonly CalendarItem[];
}

export interface CalendarDndController {
  sensors: ReturnType<typeof useSensors>;
  collisionDetection: CollisionDetection;
  candidate: CandidateSpan | null;
  activeDrag: ActiveDrag | null;
  onDragStart: (event: DragStartEvent) => void;
  onDragMove: (event: DragMoveEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDragCancel: (event: DragCancelEvent) => void;
  accessibility: {
    announcements: Announcements;
    screenReaderInstructions: ScreenReaderInstructions;
  };
  /** The keyboard move and resize modes publish their candidate through here. */
  publishCandidate: (next: CandidateSpan | null) => void;
}

/** What a finished drag did, recorded for the announcement that follows it. */
interface DragOutcome {
  kind: "moved" | "resized" | "scheduled" | "unchanged" | "cancelled";
  title: string;
  span: DaySpan | null;
}

export function useCalendarDnd({
  settings,
  callbacks,
  items,
}: CalendarDndOptions): CalendarDndController {
  const [candidate, setCandidate] = React.useState<CandidateSpan | null>(null);
  const [activeDrag, setActiveDrag] = React.useState<ActiveDrag | null>(null);

  // The drag handlers and the announcement callbacks are memoised — dnd-kit
  // rebuilds its listeners when they change — so they cannot close over
  // render-scoped values. They read the week through this instead, refreshed
  // after every commit and therefore always current by the time a pointer
  // event can reach a handler.
  const latest = React.useRef({ settings, callbacks, items });
  React.useEffect(() => {
    latest.current = { settings, callbacks, items };
  });

  const candidateRef = React.useRef<CandidateSpan | null>(null);
  const outcomeRef = React.useRef<DragOutcome | null>(null);
  const lastAnnounced = React.useRef({ at: 0, text: "" });

  const sensors = useSensors(
    // A 4px threshold is what keeps a click a click: without it, pressing a
    // block would start a drag and the "click a block to edit it" and "click
    // empty space to create" criteria would both be unreachable by mouse.
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    // A finger is different: the same 4px would turn every scroll that begins
    // on a block into a drag, and a block that cannot be scrolled past cannot
    // be reached on a phone. So a touch drag is a press-and-hold — a swipe
    // inside the hold's tolerance is left to the browser, which scrolls, and a
    // hold past the delay picks the block up, after which the sensor cancels
    // the browser's own touch handling for the rest of the drag. The block's
    // `touch-manipulation` is what lets the browser scroll in the first case.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  /*
   * The pointer, followed for the length of a drag (see `pointerYWithin`). A
   * capture listener on the window runs before dnd-kit's own document listener,
   * so by the time a move reaches `onDragMove` the position is the one that
   * move carried. Seeded from the activation so the first candidate does not
   * wait for the first move.
   */
  const pointer = React.useRef<PointerPosition | null>(null);
  const stopTracking = React.useRef<(() => void) | null>(null);
  const trackPointer = React.useCallback((activatorEvent: Event | null) => {
    stopTracking.current?.();
    pointer.current = coordinatesOf(activatorEvent);
    function onPointerMove(event: PointerEvent) {
      pointer.current = { x: event.clientX, y: event.clientY };
    }
    window.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
    stopTracking.current = () => {
      window.removeEventListener("pointermove", onPointerMove, { capture: true });
      stopTracking.current = null;
      pointer.current = null;
    };
  }, []);
  React.useEffect(() => () => stopTracking.current?.(), []);

  const publishCandidate = React.useCallback((next: CandidateSpan | null) => {
    candidateRef.current = next;
    setCandidate(next);
  }, []);

  const onDragStart = React.useCallback(
    (event: DragStartEvent) => {
      const drag = asDragData(event.active.data.current);
      if (!drag) return;
      const item = drag.type === "task" ? null : findItem(latest.current.items, drag.itemId);
      outcomeRef.current = null;
      lastAnnounced.current = { at: 0, text: "" };
      trackPointer(event.activatorEvent);
      setActiveDrag({ data: drag, item });
      // A block's own position is its first candidate, so the placeholder is
      // already under it when the drag starts rather than appearing on the
      // first move as a jump.
      publishCandidate(candidateOf(drag, originalSpanOf(drag)));
    },
    [publishCandidate, trackPointer],
  );

  const onDragMove = React.useCallback(
    (event: DragMoveEvent) => {
      const next = candidateFromEvent(event, latest.current.settings.spec, pointer.current);
      // Outside every column the last candidate stands: the placeholder should
      // not blink out because the pointer crossed the gutter, and a drop out
      // there is cancelled by `onDragEnd` anyway.
      if (next) publishCandidate(next);
    },
    [publishCandidate],
  );

  const reset = React.useCallback(() => {
    stopTracking.current?.();
    setActiveDrag(null);
    publishCandidate(null);
  }, [publishCandidate]);

  const onDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { settings: current, callbacks: handlers, items: week } = latest.current;
      const drag = asDragData(event.active.data.current);
      const landed = event.over
        ? (candidateFromEvent(event, current.spec, pointer.current) ?? candidateRef.current)
        : null;
      reset();
      if (!drag) return;

      if (!landed) {
        outcomeRef.current = { kind: "cancelled", title: drag.title, span: null };
        return;
      }

      const span = spanOfCandidate(landed);
      if (drag.type === "task") {
        outcomeRef.current = { kind: "scheduled", title: drag.title, span };
        handlers.onScheduleTask(drag.taskId, span);
        return;
      }

      const original = originalSpanOf(drag);
      if (original && spansEqual(original, span)) {
        outcomeRef.current = { kind: "unchanged", title: drag.title, span };
        return;
      }

      const item = findItem(week, drag.itemId);
      if (!item) {
        outcomeRef.current = { kind: "cancelled", title: drag.title, span: null };
        return;
      }
      outcomeRef.current = {
        kind: drag.type === "resize" ? "resized" : "moved",
        title: drag.title,
        span,
      };
      handlers.onReschedule(item, span);
    },
    [reset],
  );

  const onDragCancel = React.useCallback(
    (event: DragCancelEvent) => {
      const drag = asDragData(event.active.data.current);
      reset();
      if (drag) outcomeRef.current = { kind: "cancelled", title: drag.title, span: null };
    },
    [reset],
  );

  /**
   * dnd-kit's own live region carries the pointer drag lifecycle. The
   * application's `Announcer` carries the keyboard modes and mutation results
   * (see `announcements.ts`); one event is therefore never spoken twice.
   *
   * dnd-kit dispatches these after the matching prop handler, so `outcomeRef`
   * and `candidateRef` are already current here.
   */
  const announcements = React.useMemo<Announcements>(
    () => ({
      onDragStart({ active }) {
        const drag = asDragData(active.data.current);
        return drag ? pickedUpMessage(drag.title, originalSpanOf(drag)) : undefined;
      },
      onDragMove() {
        const current = candidateRef.current;
        if (!current) return undefined;
        const text = candidateMessage(current);
        const now = Date.now();
        if (text === lastAnnounced.current.text) return undefined;
        if (now - lastAnnounced.current.at < CANDIDATE_ANNOUNCE_INTERVAL_MS) return undefined;
        lastAnnounced.current = { at: now, text };
        return text;
      },
      // Position is already covered, at a rate a listener can follow, by
      // `onDragMove`; announcing the column change as well would double it up.
      onDragOver: () => undefined,
      onDragEnd: () => outcomeMessage(outcomeRef.current),
      onDragCancel: () => outcomeMessage(outcomeRef.current),
    }),
    [],
  );

  return {
    sensors,
    collisionDetection: pointerWithin,
    candidate,
    activeDrag,
    onDragStart,
    onDragMove,
    onDragEnd,
    onDragCancel,
    accessibility: {
      announcements,
      screenReaderInstructions: { draggable: CALENDAR_DRAG_INSTRUCTIONS },
    },
    publishCandidate,
  };
}

/** The slice of a drag event the candidate maths reads, so it can be built by hand in a test. */
export type CandidateEvent = Pick<
  DragMoveEvent | DragEndEvent,
  "active" | "over" | "activatorEvent" | "delta"
>;

/** Where the drag in `event` would land right now, or null off every column. */
export function candidateFromEvent(
  event: CandidateEvent,
  spec: GridSpec,
  pointer: PointerPosition | null,
): CandidateSpan | null {
  const drag = asDragData(event.active.data.current);
  const drop = asDayDropData(event.over?.data.current);
  if (!drag || !drop || !event.over) return null;
  const pointerY = pointerYWithin(
    event.over.rect.top,
    pointer,
    event.activatorEvent,
    event.delta.y,
  );
  if (pointerY === null) return null;
  return candidateOf(drag, resolveCandidateSpan({ drag, date: drop.date, pointerY, spec }));
}

function candidateOf(drag: DragData, span: DaySpan | null): CandidateSpan | null {
  if (!span) return null;
  return { ...span, itemId: drag.type === "task" ? null : drag.itemId, label: formatSpan(span) };
}

function spanOfCandidate(candidate: CandidateSpan): DaySpan {
  return {
    date: candidate.date,
    startMinutes: candidate.startMinutes,
    endMinutes: candidate.endMinutes,
  };
}

function findItem(items: readonly CalendarItem[], id: string): CalendarItem | null {
  return items.find((item) => item.id === id) ?? null;
}

function outcomeMessage(outcome: DragOutcome | null): string | undefined {
  if (!outcome) return undefined;
  if (!outcome.span) return cancelledMessage(outcome.title);
  switch (outcome.kind) {
    case "scheduled":
      return scheduledMessage(outcome.title, outcome.span);
    case "resized":
      return resizedMessage(outcome.title, outcome.span);
    case "unchanged":
      return unchangedMessage(outcome.title);
    case "moved":
      return droppedMessage(outcome.title, outcome.span);
    default:
      return cancelledMessage(outcome.title);
  }
}

/* -------------------------------------------------------------------------- */
/* The interaction context                                                    */
/* -------------------------------------------------------------------------- */

/**
 * What the day columns and the blocks need from the board: somewhere to publish
 * a keyboard candidate so it renders through the same placeholder as a pointer
 * drag, and the shared grid cursor / roving focus.
 *
 * It is a context rather than props because the grid lane owns the tree between
 * the board and these components, and threading two more props through it would
 * couple the two lanes for no benefit.
 */
export interface CalendarInteraction {
  candidate: CandidateSpan | null;
  publishCandidate: (next: CandidateSpan | null) => void;
  cursor: GridCursorController;
}

export const CalendarInteractionContext = React.createContext<CalendarInteraction | null>(null);

export function useCalendarInteraction(): CalendarInteraction | null {
  return React.use(CalendarInteractionContext);
}
