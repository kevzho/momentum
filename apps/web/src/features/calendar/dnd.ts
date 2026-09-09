import type { LocalDate, Minutes, Uuid } from "@momentum/core/types";

/**
 * Typed dnd-kit payloads and the guards that read them back; a payload that
 * does not match its shape is ignored. Droppables are day columns, not time
 * slots: the time comes from the pointer's Y via `@momentum/core/calendar`.
 */

/** An unscheduled task dragged out of the Plan panel onto the grid. */
export interface TaskDragData {
  type: "task";
  taskId: Uuid;
  title: string;
  /** The block length the drop will create — the task's estimate, or the fallback. */
  durationMinutes: Minutes;
}

/** An existing block being moved to another time, another day, or both. */
export interface BlockDragData {
  type: "block";
  /** `CalendarItem.id` — a row id, or `${seriesId}:${occurrenceDate}`. */
  itemId: string;
  title: string;
  /** Wall-clock length, preserved exactly across the move. */
  durationMinutes: Minutes;
  /** Where inside the block the pointer grabbed it, in pixels from its top edge. */
  grabOffsetY: number;
  /** The day the block currently sits on, so a move within one day is recognisable. */
  date: LocalDate;
  startMinutes: Minutes;
}

/** One edge of a block being dragged to change its duration. */
export interface ResizeDragData {
  type: "resize";
  itemId: string;
  title: string;
  edge: "start" | "end";
  date: LocalDate;
  startMinutes: Minutes;
  endMinutes: Minutes;
}

export type DragData = TaskDragData | BlockDragData | ResizeDragData;

/** A day column. The only droppable in the calendar. */
export interface DayDropData {
  type: "day";
  date: LocalDate;
}

/** Stable dnd-kit ids. Ids must be unique across the whole `DndContext`. */
export function dayDroppableId(date: LocalDate): string {
  return `day:${date}`;
}

export function blockDraggableId(itemId: string): string {
  return `block:${itemId}`;
}

export function resizeDraggableId(itemId: string, edge: "start" | "end"): string {
  return `resize:${edge}:${itemId}`;
}

export function taskDraggableId(taskId: Uuid): string {
  return `task:${taskId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function asDragData(value: unknown): DragData | null {
  if (!isRecord(value)) return null;

  switch (value.type) {
    case "task":
      return typeof value.taskId === "string" &&
        typeof value.title === "string" &&
        typeof value.durationMinutes === "number"
        ? (value as unknown as TaskDragData)
        : null;
    case "block":
      return typeof value.itemId === "string" &&
        typeof value.title === "string" &&
        typeof value.durationMinutes === "number" &&
        typeof value.grabOffsetY === "number" &&
        typeof value.date === "string" &&
        typeof value.startMinutes === "number"
        ? (value as unknown as BlockDragData)
        : null;
    case "resize":
      return typeof value.itemId === "string" &&
        typeof value.title === "string" &&
        (value.edge === "start" || value.edge === "end") &&
        typeof value.date === "string" &&
        typeof value.startMinutes === "number" &&
        typeof value.endMinutes === "number"
        ? (value as unknown as ResizeDragData)
        : null;
    default:
      return null;
  }
}

export function asDayDropData(value: unknown): DayDropData | null {
  if (!isRecord(value)) return null;
  return value.type === "day" && typeof value.date === "string"
    ? (value as unknown as DayDropData)
    : null;
}

/** The length a task's block gets when it is dropped with no estimate. */
export const DEFAULT_TASK_BLOCK_MINUTES: Minutes = 30;
