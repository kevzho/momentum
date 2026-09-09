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
 * The pointer half of the calendar's interaction model: everything one
 * `DndContext` needs. Geometry comes from `@momentum/core/calendar`. Nothing
 * here mutates; a drag publishes a candidate span and only `onDragEnd` calls a callback.
 */

/** Where the pointer is in the viewport, tracked for the length of a drag. */
export interface PointerPosition {
  x: number;
  y: number;
}

/**
 * The pointer's offset inside a day column, from the live pointer when known.
 * The `delta` fallback is only right when the dragged element and the column
 * share a scroll container: dnd-kit's `delta` is scroll-adjusted, so a task
 * dragged out of the scrolled Plan panel would land off by that offset.
 * Null when neither is available.
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
 * Where an in-flight drag would land. A resize keeps the day it started on
 * however far sideways the pointer wanders.
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

/** Keyboard move by minutes. Duration is preserved; `shiftSpan` does not re-snap. */
export function moveSpanByMinutes(span: DaySpan, delta: Minutes, spec: GridSpec): DaySpan {
  const moved = shiftSpan({ start: span.startMinutes, end: span.endMinutes }, delta, spec);
  return { date: span.date, startMinutes: moved.start, endMinutes: moved.end };
}

/** Keyboard move across columns. The wall-clock time is untouched, so the duration survives. */
export function moveSpanByDays(span: DaySpan, days: number): DaySpan {
  return { ...span, date: addDays(span.date, days) };
}

/** Keyboard resize by minutes: only the named edge moves, and the span never shrinks past `minMinutes`. */
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

/** The span between two snapped times, in either drag direction, never shorter than the floor. */
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

  // The handlers are memoised (dnd-kit rebuilds its listeners when they
  // change), so they read render-scoped values through this ref.
  const latest = React.useRef({ settings, callbacks, items });
  React.useEffect(() => {
    latest.current = { settings, callbacks, items };
  });

  const candidateRef = React.useRef<CandidateSpan | null>(null);
  const outcomeRef = React.useRef<DragOutcome | null>(null);
  const lastAnnounced = React.useRef({ at: 0, text: "" });

  const sensors = useSensors(
    // The distance threshold keeps a click a click.
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    // Touch is press-and-hold, so a swipe that begins on a block still
    // scrolls; the block's `touch-manipulation` is what lets the browser do that.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  // The pointer, followed for the length of a drag (see `pointerYWithin`). A
  // capture listener runs before dnd-kit's own document listener, so
  // `onDragMove` sees the position that move carried.
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
      // A block's own position is its first candidate, so the placeholder does not jump in.
      publishCandidate(candidateOf(drag, originalSpanOf(drag)));
    },
    [publishCandidate, trackPointer],
  );

  const onDragMove = React.useCallback(
    (event: DragMoveEvent) => {
      const next = candidateFromEvent(event, latest.current.settings.spec, pointer.current);
      // Outside every column the last candidate stands; `onDragEnd` cancels a drop out there.
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

  // dnd-kit's live region carries the pointer lifecycle only (see
  // `announcements.ts`). It dispatches these after the matching prop handler,
  // so `outcomeRef` and `candidateRef` are already current.
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
      // Position is already spoken by `onDragMove`.
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

/**
 * What day columns and blocks need from the board: a place to publish a
 * keyboard candidate (rendered through the same placeholder as a pointer
 * drag) and the shared grid cursor.
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
