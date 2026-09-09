import type { Uuid } from "../types/scalars";
import type { Task } from "../types/task";

/**
 * List ordering. Pure, total, and stable.
 *
 * "Stable" is load-bearing rather than incidental: the list is drag-reorderable
 * and keyboard-reorderable, so a comparator that returned 0 for two rows and
 * let them swap on an unrelated re-render would move a row the user did not
 * touch. Every comparator here ends in a deterministic tie-break.
 */

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

/**
 * One comparison between two rows on one key.
 *
 * `reversible` is the part a plain comparator gets wrong. A row whose value is
 * *absent* is not ordered relative to a row that has one — it simply goes last
 * — so that ordering must survive `desc` unchanged, while the ordering between
 * two rows that both have values must not. Carrying the distinction in the
 * return value is what lets `sortTasks` apply the direction to exactly the
 * comparisons it should.
 */
interface Comparison {
  order: number;
  /** False for "absent sorts last", which is fixed in both directions. */
  reversible: boolean;
}

/** `null` means "equal on this key"; the caller falls through to the tie-break. */
type Comparator = (a: Task, b: Task) => Comparison | null;

/**
 * Missing values sort last in BOTH directions.
 *
 * Deliberate, and the one place this file departs from a plain comparator. A
 * task with no due date has not "got the largest due date" — it has no
 * deadline, and reversing the sort should not float a hundred undated tasks to
 * the top and bury the three that are actually due. The same holds for
 * estimates.
 */
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

/**
 * The comparators, each in its natural "ascending" reading:
 * soonest deadline, most urgent, A→Z, oldest, shortest, user's own order.
 */
const COMPARATORS: Record<TaskSort, Comparator> = {
  manual: (a, b) => compareRequired(byNumber(a.sortOrder, b.sortOrder)),
  due: (a, b) => compareOptional(a.dueDate, b.dueDate, byString),
  // `1` is the most urgent priority and `4` means "none", so ascending by the
  // stored number is already most-urgent-first.
  priority: (a, b) => compareRequired(byNumber(a.priority, b.priority)),
  title: (a, b) => compareRequired(a.title.localeCompare(b.title, "en", { sensitivity: "base" })),
  created: (a, b) => compareRequired(byString(a.createdAt, b.createdAt)),
  estimate: (a, b) => compareOptional(a.estimatedMinutes, b.estimatedMinutes, byNumber),
};

/**
 * Sorts a copy. The input is server props and is never mutated.
 *
 * The tie-break chain is manual order, then id: two tasks that are equal on the
 * chosen key keep the order the user dragged them into, and two that were never
 * dragged still land in a fixed order rather than whichever the engine felt
 * like. `manual` itself falls straight through to the id.
 */
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

/* -------------------------------------------------------------------------- */
/* Manual reordering                                                          */
/* -------------------------------------------------------------------------- */

/**
 * `sort_order` is `double precision` precisely so a row can be inserted at the
 * midpoint of its two new neighbours (`20260906120300_tasks.sql`). Wherever a
 * midpoint exists one row is written per reorder instead of renumbering the
 * list, which is what makes both the drag and its keyboard equivalent a single
 * optimistic mutation.
 *
 * The ends are the two cases with only one neighbour: dropping at the top goes
 * one step below the current first, at the bottom one step above the current
 * last. `STEP` is 1 because these are floats and the absolute scale is
 * meaningless — only the ordering is.
 */
const STEP = 1;

/** One row's new place in the list: what a reorder writes. */
export interface TaskOrder {
  id: Uuid;
  sortOrder: number;
}

/**
 * The writes that place `movedId` at `toIndex` of `ordered`.
 *
 * `ordered` is the list as displayed, and `toIndex` is the index the row should
 * end up at *after* the move — the same convention the keyboard path and the
 * drop handler both speak. Empty means "write nothing": the move is a no-op, or
 * the list already reads the way it would afterwards.
 *
 * One change is the ordinary answer. More than one is the tied-run case below,
 * which no single number can express.
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

  // The neighbours in the list with the moved row taken out, which is what the
  // list will look like once it lands.
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
 * The neighbours hold the same number, so there is no midpoint — and no value
 * given to the moved row alone can land it between them. `sortTasks`'s manual
 * comparator reads `sortOrder` first and only falls through to the id
 * tie-break when two rows are *exactly* equal: a number below the run sorts the
 * moved row above all of it, a number above sorts it below all of it, and the
 * run's own number restores the very id order the drag is trying to change.
 *
 * This is the normal state of a list, not an edge case — every task is created
 * at `0` — so the run is spread instead. The tied rows and the moved row are
 * given evenly spaced numbers in the order the list will read, inside the gap
 * left by the nearest distinct row on either side, and the rows whose number
 * does not actually change are not written. Every already-spread list still
 * bisects with the single write above.
 */
function spreadTiedRun(without: readonly Task[], target: number, moved: Task): TaskOrder[] {
  const tied = (without[target] as Task).sortOrder;

  // The whole run of equal orders around the seam; `target - 1` and `target`
  // are both in it by construction.
  let first = target - 1;
  while (first > 0 && (without[first - 1] as Task).sortOrder === tied) first -= 1;
  let last = target;
  while (last + 1 < without.length && (without[last + 1] as Task).sortOrder === tied) last += 1;

  const run = [...without.slice(first, target), moved, ...without.slice(target, last + 1)];
  const under = without[first - 1];
  const over = without[last + 1];
  // With no distinct row on a side there is nothing to stay clear of, so the
  // run simply takes `STEP`-wide room of its own on that side.
  const below = under === undefined ? tied - STEP * (run.length + 1) : under.sortOrder;
  const above = over === undefined ? tied + STEP * (run.length + 1) : over.sortOrder;
  const gap = (above - below) / (run.length + 1);

  return run
    .map((task, index) => ({ id: task.id, sortOrder: below + gap * (index + 1) }))
    .filter((change, index) => change.sortOrder !== (run[index] as Task).sortOrder);
}

/**
 * The number that puts a new row at the top of the list.
 *
 * Quick Add captures from any route, and a capture is meant to be the first
 * thing the user sees in the Inbox — not a row sorted into the middle of
 * whatever else happens to hold the default `0`. One step below the current
 * minimum is distinct from every row that exists, so the new row is placed
 * rather than tied, and the next reorder is the single write above.
 */
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
