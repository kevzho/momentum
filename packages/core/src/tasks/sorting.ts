import type { Uuid } from "../types/scalars";
import type { Task } from "../types/task";

/** List ordering. Every comparator ends in a deterministic tie-break: the list is reorderable, so rows must never swap on a re-render. */

export const TASK_SORTS = ["manual", "due", "priority", "title", "created", "estimate"] as const;
export type TaskSort = (typeof TASK_SORTS)[number];

export type SortDirection = "asc" | "desc";

export function isTaskSort(value: string): value is TaskSort {
  return (TASK_SORTS as readonly string[]).includes(value);
}

export const TASK_SORT_LABELS: Record<TaskSort, string> = {
  manual: "Manual",
  due: "Due date",
  priority: "Priority",
  title: "Title",
  created: "Created",
  estimate: "Estimate",
};

/** One comparison between two rows on one key. */
interface Comparison {
  order: number;
  /** False for "absent sorts last", which is fixed in both directions. */
  reversible: boolean;
}

/** `null` means "equal on this key"; the caller falls through to the tie-break. */
type Comparator = (a: Task, b: Task) => Comparison | null;

/** Missing values sort last in BOTH directions: reversing "due" must not float every undated task to the top. */
function compareOptional<T>(
  a: T | null,
  b: T | null,
  compare: (a: T, b: T) => number,
): Comparison | null {
  if (a === null && b === null) return null;
  if (a === null) return { order: 1, reversible: false };
  if (b === null) return { order: -1, reversible: false };
  const order = compare(a, b);
  return order === 0 ? null : { order, reversible: true };
}

/** A key every row has, so its ordering always reverses with the direction. */
function compareRequired(order: number): Comparison | null {
  return order === 0 ? null : { order, reversible: true };
}

const byString = (a: string, b: string): number => a.localeCompare(b, "en");
const byNumber = (a: number, b: number): number => a - b;

/** Each in its natural "ascending" reading: soonest deadline, most urgent, A→Z, oldest, shortest, user's own order. */
const COMPARATORS: Record<TaskSort, Comparator> = {
  manual: (a, b) => compareRequired(byNumber(a.sortOrder, b.sortOrder)),
  due: (a, b) => compareOptional(a.dueDate, b.dueDate, byString),
  // `1` is the most urgent, so ascending by the stored number is most-urgent-first.
  priority: (a, b) => compareRequired(byNumber(a.priority, b.priority)),
  title: (a, b) => compareRequired(a.title.localeCompare(b.title, "en", { sensitivity: "base" })),
  created: (a, b) => compareRequired(byString(a.createdAt, b.createdAt)),
  estimate: (a, b) => compareOptional(a.estimatedMinutes, b.estimatedMinutes, byNumber),
};

/** Sorts a copy; never mutates. Tie-break is manual order, then id. */
export function sortTasks(
  tasks: readonly Task[],
  sort: TaskSort,
  direction: SortDirection = "asc",
): Task[] {
  const compare = COMPARATORS[sort];
  const sign = direction === "desc" ? -1 : 1;

  return [...tasks].sort((a, b) => {
    const primary = compare(a, b);
    if (primary !== null) return primary.reversible ? primary.order * sign : primary.order;

    if (sort !== "manual" && a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * `sort_order` is `double precision` so a row can be inserted at the midpoint
 * of its neighbours: one write per reorder. `STEP` is the room taken at either
 * end; the absolute scale is meaningless.
 */
const STEP = 1;

/** One row's new place in the list: what a reorder writes. */
export interface TaskOrder {
  id: Uuid;
  sortOrder: number;
}

/**
 * The writes that place `movedId` at `toIndex` (its index after the move) of
 * `ordered`. Empty means nothing to write; more than one is the tied-run case.
 */
export function sortOrdersForMove(
  ordered: readonly Task[],
  movedId: string,
  toIndex: number,
): TaskOrder[] {
  const fromIndex = ordered.findIndex((task) => task.id === movedId);
  const moved = ordered[fromIndex];
  if (moved === undefined) return [];

  const target = Math.max(0, Math.min(toIndex, ordered.length - 1));
  if (target === fromIndex) return [];

  // The neighbours with the moved row taken out.
  const without = ordered.filter((task) => task.id !== movedId);
  const before = target > 0 ? without[target - 1] : undefined;
  const after = without[target];

  if (before === undefined && after === undefined) return [];
  if (before === undefined) return [{ id: movedId, sortOrder: (after as Task).sortOrder - STEP }];
  if (after === undefined) return [{ id: movedId, sortOrder: before.sortOrder + STEP }];
  if (before.sortOrder !== after.sortOrder) {
    return [{ id: movedId, sortOrder: (before.sortOrder + after.sortOrder) / 2 }];
  }

  return spreadTiedRun(without, target, moved);
}

/**
 * The neighbours hold the same number, so no single value can land the moved
 * row between them (every task is created at `0`, so this is the normal case).
 * The tied run plus the moved row are spread evenly inside the gap left by the
 * nearest distinct rows; rows whose number does not change are not written.
 */
function spreadTiedRun(without: readonly Task[], target: number, moved: Task): TaskOrder[] {
  const tied = (without[target] as Task).sortOrder;

  // The whole run of equal orders around the seam.
  let first = target - 1;
  while (first > 0 && (without[first - 1] as Task).sortOrder === tied) first -= 1;
  let last = target;
  while (last + 1 < without.length && (without[last + 1] as Task).sortOrder === tied) last += 1;

  const run = [...without.slice(first, target), moved, ...without.slice(target, last + 1)];
  const under = without[first - 1];
  const over = without[last + 1];
  // With no distinct row on a side, the run takes `STEP`-wide room of its own.
  const below = under === undefined ? tied - STEP * (run.length + 1) : under.sortOrder;
  const above = over === undefined ? tied + STEP * (run.length + 1) : over.sortOrder;
  const gap = (above - below) / (run.length + 1);

  return run
    .map((task, index) => ({ id: task.id, sortOrder: below + gap * (index + 1) }))
    .filter((change, index) => change.sortOrder !== (run[index] as Task).sortOrder);
}

/** The number that puts a new row at the top of the list: one step below the current minimum, so it is placed rather than tied. */
export function sortOrderBefore(tasks: readonly { sortOrder: number }[]): number {
  let minimum = Infinity;
  for (const task of tasks) minimum = Math.min(minimum, task.sortOrder);
  return (Number.isFinite(minimum) ? minimum : 0) - STEP;
}

/** Reorders a list in memory, for the optimistic view of a drag or a keyboard move. */
export function moveInList<T extends { id: string }>(
  items: readonly T[],
  movedId: string,
  toIndex: number,
): T[] {
  const fromIndex = items.findIndex((item) => item.id === movedId);
  if (fromIndex === -1) return [...items];

  const target = Math.max(0, Math.min(toIndex, items.length - 1));
  if (target === fromIndex) return [...items];

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (moved === undefined) return [...items];
  next.splice(target, 0, moved);
  return next;
}
