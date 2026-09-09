"use client";

import * as React from "react";
import {
  CheckCheckIcon,
  CircleCheckIcon,
  InboxIcon,
  ListTodoIcon,
  SunriseIcon,
  CalendarRangeIcon,
  FolderIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { TaskView } from "@momentum/core/tasks";
import type { LocalDate, Uuid } from "@momentum/core/types";

import { EmptyState } from "@momentum/ui/components/empty-state";
import { Kbd } from "@momentum/ui/components/kbd";

import { TaskListRow, type TaskRowData } from "@/features/tasks/components/task-list-row";

/**
 * The list, and the keyboard model that drives it.
 *
 * One tab stop for the whole list and a roving `tabIndex` inside it: arrow keys
 * move the cursor, Tab leaves. Sixty tasks are not sixty tab stops.
 *
 * Every action the pointer can reach has a key, and every one of them is a key
 * a person would guess:
 *
 * | `↑` `↓`        | move the cursor                                   |
 * | `Enter`        | open the detail sheet                             |
 * | `Space`        | complete / reopen                                 |
 * | `X`            | add to or remove from the selection                |
 * | `Shift+↑/↓`    | extend the selection                              |
 * | `Alt+↑/↓`      | move the task up or down — the drag's keyboard path |
 * | `Escape`       | clear the selection                               |
 * | `Home` `End`   | first / last task                                 |
 *
 * `Alt+↑/↓` is Domain Rule 10: reordering is achievable by dragging, so it must
 * be achievable by keyboard alone, and it must be announced. It commits the
 * same mutation the drop does, through the same `sortOrdersForMove`.
 */
export interface TaskListProps {
  rows: readonly TaskRowData[];
  today: LocalDate;
  view: TaskView;
  filtered: boolean;
  selectedIds: ReadonlySet<Uuid>;
  pendingIds: ReadonlySet<Uuid>;
  focusedId: Uuid | null;
  onFocusedIdChange: (id: Uuid | null) => void;
  onToggleComplete: (taskId: Uuid, completed: boolean) => void;
  onOpen: (taskId: Uuid) => void;
  onSelectionChange: (ids: ReadonlySet<Uuid>) => void;
  /** Move the task at `fromIndex` to `toIndex` — the drag's keyboard equivalent. */
  onMove: (taskId: Uuid, toIndex: number) => void;
}

export function TaskList({
  rows,
  today,
  view,
  filtered,
  selectedIds,
  pendingIds,
  focusedId,
  onFocusedIdChange,
  onToggleComplete,
  onOpen,
  onSelectionChange,
  onMove,
}: TaskListProps) {
  const refs = React.useRef(new Map<Uuid, HTMLLIElement>());
  // The anchor a Shift+arrow range extends from, so extending and then
  // reversing shrinks the range rather than growing it the other way.
  const anchor = React.useRef<Uuid | null>(null);
  /*
   * Whether the keyboard user is *in* the list. Set by focus arriving on a row
   * and cleared by focus leaving for somewhere else — but not by a row being
   * removed from under the cursor, which fires no `blur` and leaves
   * `document.activeElement` on `<body>`. That combination is the signal the
   * effect below acts on.
   */
  const focusInside = React.useRef(false);

  const index = React.useMemo(
    () => rows.findIndex((row) => row.task.id === focusedId),
    [rows, focusedId],
  );

  /*
   * The cursor follows the list. When the focused task leaves the view — it was
   * completed, deleted, or filtered out — the tab stop moves to the row that
   * took its place rather than being lost, which is the defect Phase 3 found in
   * the calendar's grid and fixed the same way.
   *
   * Moving the tab stop is not enough on its own: the row that held focus has
   * unmounted, and the browser has already dropped focus on `<body>`. So when
   * focus was inside the list and is now nowhere, the replacement row is
   * focused too — the same hand-off the calendar grid makes — and Space then
   * ArrowDown keeps working (Domain Rule 10).
   */
  React.useEffect(() => {
    if (rows.length === 0) {
      if (focusedId !== null) onFocusedIdChange(null);
      return;
    }
    if (focusedId === null || !rows.some((row) => row.task.id === focusedId)) {
      const next = rows[0]?.task.id ?? null;
      onFocusedIdChange(next);
      const dropped = document.activeElement === null || document.activeElement === document.body;
      if (next !== null && focusInside.current && dropped) refs.current.get(next)?.focus();
    }
  }, [rows, focusedId, onFocusedIdChange]);

  function focusRow(target: number): void {
    const row = rows[Math.max(0, Math.min(target, rows.length - 1))];
    if (row === undefined) return;
    onFocusedIdChange(row.task.id);
    refs.current.get(row.task.id)?.focus();
  }

  function rangeTo(target: number): void {
    const from = rows.findIndex((row) => row.task.id === (anchor.current ?? focusedId));
    if (from === -1) return;
    const [lo, hi] = from <= target ? [from, target] : [target, from];
    onSelectionChange(new Set(rows.slice(lo, hi + 1).map((row) => row.task.id)));
  }

  function toggleSelected(taskId: Uuid): void {
    const next = new Set(selectedIds);
    if (next.has(taskId)) next.delete(taskId);
    else next.add(taskId);
    anchor.current = taskId;
    onSelectionChange(next);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLUListElement>): void {
    // A keystroke typed into an input inside the list belongs to the input.
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, [contenteditable='true']")) return;

    const row = rows[index];

    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        const delta = event.key === "ArrowDown" ? 1 : -1;
        event.preventDefault();

        // Alt reorders instead of navigating: the drag's keyboard equivalent.
        if (event.altKey) {
          if (row === undefined) return;
          const to = index + delta;
          if (to < 0 || to >= rows.length) return;
          onMove(row.task.id, to);
          // Keep the cursor on the task that moved, not on the position.
          queueMicrotask(() => refs.current.get(row.task.id)?.focus());
          return;
        }

        if (event.shiftKey) {
          if (anchor.current === null) anchor.current = focusedId;
          const to = Math.max(0, Math.min(index + delta, rows.length - 1));
          focusRow(to);
          rangeTo(to);
          return;
        }

        anchor.current = null;
        focusRow(index + delta);
        return;
      }

      case "Home":
        event.preventDefault();
        focusRow(0);
        return;

      case "End":
        event.preventDefault();
        focusRow(rows.length - 1);
        return;

      case "Enter":
        if (row === undefined) return;
        event.preventDefault();
        onOpen(row.task.id);
        return;

      case " ":
        if (row === undefined) return;
        event.preventDefault();
        onToggleComplete(row.task.id, row.task.status !== "completed");
        return;

      case "x":
      case "X":
        if (row === undefined) return;
        event.preventDefault();
        toggleSelected(row.task.id);
        return;

      case "Escape":
        if (selectedIds.size === 0) return;
        event.preventDefault();
        anchor.current = null;
        onSelectionChange(new Set());
        return;

      case "a":
      case "A":
        if (!event.metaKey && !event.ctrlKey) return;
        event.preventDefault();
        onSelectionChange(new Set(rows.map((r) => r.task.id)));
        return;

      default:
    }
  }

  if (rows.length === 0) {
    return <TaskListEmptyState view={view} filtered={filtered} />;
  }

  return (
    <ul
      // A plain list. `listbox` would make every row an `option`, which is
      // children-presentational in ARIA and would hide both checkboxes in every
      // row from assistive technology — see the note in `task-list-row.tsx`.
      aria-label="Tasks"
      aria-describedby="task-list-keys"
      className="flex flex-col gap-0.5"
      onKeyDown={onKeyDown}
      onFocus={() => {
        focusInside.current = true;
      }}
      onBlur={(event) => {
        // Focus moving to another row is not leaving; focus lost to a removed
        // row has no `relatedTarget` and is not leaving either.
        const to = event.relatedTarget;
        if (to instanceof Node && event.currentTarget.contains(to)) return;
        if (to === null) return;
        focusInside.current = false;
      }}
    >
      {rows.map((row, rowIndex) => (
        <TaskListRow
          key={row.task.id}
          data={row}
          today={today}
          index={rowIndex}
          focused={row.task.id === focusedId}
          selected={selectedIds.has(row.task.id)}
          selectionActive={selectedIds.size > 0}
          pending={pendingIds.has(row.task.id)}
          onToggleComplete={(completed) => onToggleComplete(row.task.id, completed)}
          onOpen={() => onOpen(row.task.id)}
          onToggleSelected={() => toggleSelected(row.task.id)}
          onFocusRow={() => onFocusedIdChange(row.task.id)}
          registerRef={(node) => {
            if (node) refs.current.set(row.task.id, node);
            else refs.current.delete(row.task.id);
          }}
        />
      ))}
    </ul>
  );
}

/**
 * The one hint, once, for the keys the rows cannot show on their own.
 *
 * It also doubles as the list's focus anchor, which is why it takes a `ref` and
 * is programmatically focusable. It is the list's own `aria-describedby`, it
 * sits immediately above the list, and — unlike the `<ul>`, which a bulk delete
 * can replace with an empty state — it is rendered whatever the list holds. A
 * control that unmounts itself hands focus here rather than to `<body>`, and
 * one Tab onwards is the list's roving cursor (Domain Rule 10).
 *
 * `tabIndex={-1}` keeps it out of the tab order: it can be focused, never
 * tabbed to.
 */
export function TaskListKeyHint({ ref }: { ref?: React.Ref<HTMLParagraphElement> }) {
  return (
    <p
      ref={ref}
      id="task-list-keys"
      tabIndex={-1}
      // Visually hidden below `md`, where there is no keyboard to hint at: it
      // stays in the DOM as the list's description and its focus anchor.
      className="rounded-md px-2 text-2xs text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 max-md:sr-only"
    >
      <Kbd>↑</Kbd> <Kbd>↓</Kbd> to move · <Kbd>Enter</Kbd> to open · <Kbd>Space</Kbd> to complete ·{" "}
      <Kbd>X</Kbd> to select · <Kbd>Alt</Kbd>+<Kbd>↑</Kbd>/<Kbd>↓</Kbd> to reorder
    </p>
  );
}

/**
 * A designed empty state per view.
 *
 * Each says what this particular list being empty means and what to do next.
 * None of them moralises — an empty Today is "nothing due today", never "you
 * have not planned your day" (Domain Rule 7).
 */
const EMPTY: Record<TaskView, { icon: LucideIcon; title: string; description: string }> = {
  inbox: {
    icon: InboxIcon,
    title: "Inbox is clear",
    description: "Everything captured has been filed into a project. Press Q to add something new.",
  },
  today: {
    icon: SunriseIcon,
    title: "Nothing due today",
    description:
      "No task has today's date or an earlier one. Work scheduled for today lives on the calendar.",
  },
  upcoming: {
    icon: CalendarRangeIcon,
    title: "Nothing due later",
    description: "No open task has a deadline after today. A task can be scheduled without one.",
  },
  all: {
    icon: ListTodoIcon,
    title: "No open tasks",
    description: "Press Q to capture one — a title is enough, everything else is optional.",
  },
  completed: {
    icon: CircleCheckIcon,
    title: "Nothing completed yet",
    description: "Tasks you finish will collect here.",
  },
  project: {
    icon: FolderIcon,
    title: "Nothing in this project",
    description: "Press Q to add the first task, or move an existing one here from its details.",
  },
};

function TaskListEmptyState({ view, filtered }: { view: TaskView; filtered: boolean }) {
  if (filtered) {
    return (
      <EmptyState
        icon={CheckCheckIcon}
        title="No tasks match these filters"
        description="Clear a filter, or widen the search, to see the rest of this view."
      />
    );
  }

  const state = EMPTY[view];
  return <EmptyState icon={state.icon} title={state.title} description={state.description} />;
}
