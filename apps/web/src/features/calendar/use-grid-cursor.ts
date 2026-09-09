"use client";

import * as React from "react";

import { clampSpan, snap, type GridSpec } from "@momentum/core/calendar";
import type { LocalDate, Minutes } from "@momentum/core/types";

import { DEFAULT_TASK_BLOCK_MINUTES } from "@/features/calendar/dnd";
import type { DaySpan } from "@/features/calendar/types";

/**
 * Keyboard navigation of the grid: the create cursor, and the roving tabindex
 * that keeps a week of blocks from being a week of tab stops.
 *
 * docs/ARCHITECTURE.md §9 gives empty space two keyboard equivalents — a
 * visible cursor moved with the arrows that Enter turns into a block, and
 * Shift+Down to extend it into a span. Both need somewhere to live that is not
 * a single column, because Left and Right cross columns, so the cursor is one
 * piece of state for the whole grid rather than seven.
 *
 * The roving tabindex is the second half of the same problem. Every block is
 * focusable, so without it Tab walks through sixty blocks before reaching the
 * page's next control. Instead the grid offers two tab stops — one column and
 * one block — and the arrow keys move within each group, which is the standard
 * composite-widget pattern and the one screen-reader users expect.
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

/**
 * The cursor's opening position on a day.
 *
 * 09:00 rather than the top of the grid: the grid starts at 05:00 by default
 * and a cursor that opens there has to be arrowed through four empty hours
 * before it reaches a time anyone schedules. `clampSpan` pulls it back inside
 * grids that start later or end earlier.
 */
export function defaultCursorSpan(date: LocalDate, spec: GridSpec): DaySpan {
  const span = clampSpan(snap(DEFAULT_CURSOR_MINUTES, spec), DEFAULT_TASK_BLOCK_MINUTES, spec);
  return { date, startMinutes: span.start, endMinutes: span.end };
}

export function useGridCursor(): GridCursorController {
  const [cursor, setCursor] = React.useState<DaySpan | null>(null);
  /**
   * The tab stop of each group. Held as state because `isTabStop` is read
   * during render, and as one object so that claiming a stop for one group
   * never disturbs the other.
   */
  const [tabStops, setTabStops] = React.useState<Record<GridFocusKind, string | null>>({
    column: null,
    block: null,
  });

  // A ref, not state: registration happens in a layout effect for every column
  // and every block on the week, and re-rendering the grid once per block as it
  // mounts would be the performance problem specs/03 warns about.
  const entries = React.useRef(new Map<string, GridFocusEntry>());

  /**
   * The item whose block should take focus back when it remounts.
   *
   * A block's React key is `${item.id}:${date}`, so moving one to another day
   * unmounts it and mounts a different element — and the keyboard user who
   * pressed Enter to commit the move is left on `<body>`, at the top of the
   * page. The item id survives the move; the segment key does not.
   */
  const reclaiming = React.useRef<string | null>(null);

  const register = React.useCallback((entry: GridFocusEntry) => {
    entries.current.set(entry.id, entry);
    // The first element of a group to mount claims its tab stop, so the grid is
    // reachable before the user has focused anything.
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
        // If nothing remounts under that item id — the block was deleted, not
        // moved — focus has to land somewhere real rather than on `<body>`.
        // A timeout, because this runs before the replacing element mounts.
        setTimeout(() => {
          if (reclaiming.current === null) return;
          reclaiming.current = null;
          const fallback =
            ordered(entries.current, "block")[0] ?? entries.current.get(columnFocusId(entry.date));
          fallback?.node.focus();
        }, 0);
      }

      /*
       * Release the stop, then repair it after the commit has settled.
       *
       * Releasing alone is not enough: `register` runs on mount, every
       * surviving block is already mounted, and nothing re-claims — so
       * deleting the block that happened to hold the stop took the whole
       * group out of the tab order. Promoting a survivor *here* is not enough
       * either, because several elements can unmount in one commit and the
       * survivor picked during the first cleanup may be gone by the last,
       * leaving the stop pointing at an id nothing renders — which looks
       * exactly like having no stop at all.
       *
       * A microtask runs after every cleanup and every re-registration of the
       * commit, so `entries` is settled and anything that remounted has
       * already claimed a null stop. Only a group that is genuinely empty of a
       * stop is repaired.
       */
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

/**
 * The item a segment belongs to. A segment key is `${item.id}:${date}` and an
 * item id may itself be `${seriesId}:${occurrenceDate}`, so the date is the
 * part after the *last* colon and everything before it is the item.
 */
function itemIdOf(segmentKey: string): string {
  const cut = segmentKey.lastIndexOf(":");
  return cut === -1 ? segmentKey : segmentKey.slice(0, cut);
}

/* -------------------------------------------------------------------------- */
/* Neighbour resolution — pure, so the ordering rules are testable             */
/* -------------------------------------------------------------------------- */

function ordered(all: ReadonlyMap<string, GridFocusEntry>, kind: GridFocusKind): GridFocusEntry[] {
  return [...all.values()].filter((entry) => entry.kind === kind).sort(byDateThenStart);
}

function byDateThenStart(a: GridFocusEntry, b: GridFocusEntry): number {
  // `LocalDate` is `YYYY-MM-DD`, so lexical order is chronological order and no
  // date arithmetic is needed to sort a week (Domain Rule 5).
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Up and Down walk the day the element is already on; Left and Right cross to
 * the nearest element in time on an adjacent day, so moving sideways out of a
 * 14:00 block lands near 14:00 rather than back at breakfast. A day with
 * nothing on it is skipped rather than swallowing the keystroke, which is what
 * makes Right usable on a week with two blocks on it.
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
