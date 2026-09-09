"use client";

import * as React from "react";

import { clampSpan, snap, type GridSpec } from "@momentum/core/calendar";
import type { LocalDate, Minutes } from "@momentum/core/types";

import { DEFAULT_TASK_BLOCK_MINUTES } from "@/features/calendar/dnd";
import type { DaySpan } from "@/features/calendar/types";

/**
 * Keyboard navigation of the grid: the create cursor (one piece of state for
 * the whole grid, since Left/Right cross columns) and the roving tabindex
 * (two tab stops — one column, one block — with arrows moving within each group).
 */

/** Where the cursor lands when it first appears: 09:00, or the top of the grid. */
export const DEFAULT_CURSOR_MINUTES: Minutes = 9 * 60;

export type GridFocusKind = "column" | "block";

export type GridDirection = "up" | "down" | "left" | "right";

/** A focusable member of the grid, registered so the arrows can find its neighbours. */
export interface GridFocusEntry {
  /** Unique across the grid: `column:<date>` or the segment key of a block. */
  id: string;
  kind: GridFocusKind;
  date: LocalDate;
  /** Sort key within a day. Columns register at the top of the grid. */
  startMinutes: Minutes;
  node: HTMLElement;
}

export interface GridCursorController {
  /** The create cursor, or null when it has never been placed or was cleared. */
  cursor: DaySpan | null;
  setCursor: (span: DaySpan | null) => void;
  /** Registers a focusable element for the duration of its mount. */
  register: (entry: GridFocusEntry) => () => void;
  /** True for the one element of its kind that Tab reaches. */
  isTabStop: (id: string, kind: GridFocusKind) => boolean;
  /** Records that the user focused an element, so the tab stop follows them. */
  noteFocus: (id: string, kind: GridFocusKind) => void;
  /** Moves DOM focus to a neighbour. False when there is nothing that way. */
  focusNeighbour: (id: string, kind: GridFocusKind, direction: GridDirection) => boolean;
  /** Moves DOM focus to a day column. Used when a cursor move crosses columns. */
  focusDate: (date: LocalDate) => boolean;
  /** Whether the displayed range has a column for this date. */
  hasDate: (date: LocalDate) => boolean;
}

export const columnFocusId = (date: LocalDate): string => `column:${date}`;

/** The cursor's opening position on a day; `clampSpan` keeps it inside the grid. */
export function defaultCursorSpan(date: LocalDate, spec: GridSpec): DaySpan {
  const span = clampSpan(snap(DEFAULT_CURSOR_MINUTES, spec), DEFAULT_TASK_BLOCK_MINUTES, spec);
  return { date, startMinutes: span.start, endMinutes: span.end };
}

export function useGridCursor(): GridCursorController {
  const [cursor, setCursor] = React.useState<DaySpan | null>(null);
  // The tab stop of each group; state because `isTabStop` is read during render.
  const [tabStops, setTabStops] = React.useState<Record<GridFocusKind, string | null>>({
    column: null,
    block: null,
  });

  // A ref, not state: every column and block registers in a layout effect, and
  // re-rendering the grid once per mount would be a performance problem.
  const entries = React.useRef(new Map<string, GridFocusEntry>());

  // The item whose block should take focus back when it remounts: a block's
  // key is `${item.id}:${date}`, so a move to another day unmounts it and
  // would otherwise leave keyboard focus on `<body>`.
  const reclaiming = React.useRef<string | null>(null);

  const register = React.useCallback((entry: GridFocusEntry) => {
    entries.current.set(entry.id, entry);
    // The first element of a group to mount claims its tab stop.
    setTabStops((current) =>
      current[entry.kind] === null ? { ...current, [entry.kind]: entry.id } : current,
    );

    if (entry.kind === "block" && reclaiming.current === itemIdOf(entry.id)) {
      reclaiming.current = null;
      entry.node.focus();
      setTabStops((current) => ({ ...current, block: entry.id }));
    }

    return () => {
      const wasFocused = typeof document !== "undefined" && document.activeElement === entry.node;
      entries.current.delete(entry.id);

      if (wasFocused && entry.kind === "block") {
        reclaiming.current = itemIdOf(entry.id);
        // If nothing remounts under that item id (deleted, not moved), focus
        // must land somewhere real. A timeout, because this runs before the
        // replacing element mounts.
        setTimeout(() => {
          if (reclaiming.current === null) return;
          reclaiming.current = null;
          const fallback =
            ordered(entries.current, "block")[0] ?? entries.current.get(columnFocusId(entry.date));
          fallback?.node.focus();
        }, 0);
      }

      // Release the stop, then repair it in a microtask once the commit has
      // settled: several elements can unmount in one commit, so a survivor
      // promoted here may itself be gone by the last cleanup.
      setTabStops((current) =>
        current[entry.kind] === entry.id ? { ...current, [entry.kind]: null } : current,
      );
      queueMicrotask(() => {
        setTabStops((current) =>
          current[entry.kind] === null
            ? { ...current, [entry.kind]: ordered(entries.current, entry.kind)[0]?.id ?? null }
            : current,
        );
      });
    };
  }, []);

  const noteFocus = React.useCallback((id: string, kind: GridFocusKind) => {
    setTabStops((current) => (current[kind] === id ? current : { ...current, [kind]: id }));
  }, []);

  const isTabStop = React.useCallback(
    (id: string, kind: GridFocusKind) => tabStops[kind] === id,
    [tabStops],
  );

  const focusEntry = React.useCallback(
    (entry: GridFocusEntry) => {
      entry.node.focus();
      noteFocus(entry.id, entry.kind);
      return true;
    },
    [noteFocus],
  );

  const focusDate = React.useCallback(
    (date: LocalDate) => {
      const entry = entries.current.get(columnFocusId(date));
      return entry ? focusEntry(entry) : false;
    },
    [focusEntry],
  );

  const focusNeighbour = React.useCallback(
    (id: string, kind: GridFocusKind, direction: GridDirection) => {
      const from = entries.current.get(id);
      if (!from) return false;
      const target = neighbourOf(from, direction, ordered(entries.current, kind));
      return target ? focusEntry(target) : false;
    },
    [focusEntry],
  );

  const hasDate = React.useCallback(
    (date: LocalDate) => entries.current.has(columnFocusId(date)),
    [],
  );

  return {
    cursor,
    setCursor,
    register,
    isTabStop,
    noteFocus,
    focusNeighbour,
    focusDate,
    hasDate,
  };
}

// A segment key is `${item.id}:${date}` and an item id may itself contain a
// colon, so the date is the part after the last one.
function itemIdOf(segmentKey: string): string {
  const cut = segmentKey.lastIndexOf(":");
  return cut === -1 ? segmentKey : segmentKey.slice(0, cut);
}

function ordered(all: ReadonlyMap<string, GridFocusEntry>, kind: GridFocusKind): GridFocusEntry[] {
  return [...all.values()].filter((entry) => entry.kind === kind).sort(byDateThenStart);
}

function byDateThenStart(a: GridFocusEntry, b: GridFocusEntry): number {
  // `LocalDate` is `YYYY-MM-DD`, so lexical order is chronological.
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Up and Down walk the same day; Left and Right cross to the nearest element
 * in time on an adjacent day, skipping empty days.
 */
export function neighbourOf(
  from: GridFocusEntry,
  direction: GridDirection,
  entries: readonly GridFocusEntry[],
): GridFocusEntry | null {
  if (direction === "up" || direction === "down") {
    const sameDay = entries.filter((entry) => entry.date === from.date);
    const index = sameDay.findIndex((entry) => entry.id === from.id);
    if (index === -1) return null;
    return sameDay[direction === "down" ? index + 1 : index - 1] ?? null;
  }

  const step = direction === "right" ? 1 : -1;
  const days = [...new Set(entries.map((entry) => entry.date))];
  const dayIndex = days.indexOf(from.date);
  if (dayIndex === -1) return null;

  for (let index = dayIndex + step; index >= 0 && index < days.length; index += step) {
    const candidates = entries.filter((entry) => entry.date === days[index]);
    const closest = candidates.reduce<GridFocusEntry | null>((best, entry) => {
      if (!best) return entry;
      const delta = Math.abs(entry.startMinutes - from.startMinutes);
      const bestDelta = Math.abs(best.startMinutes - from.startMinutes);
      return delta < bestDelta ? entry : best;
    }, null);
    if (closest) return closest;
  }
  return null;
}
