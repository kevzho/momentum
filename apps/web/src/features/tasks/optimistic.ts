import { intervalOfSlot } from "@momentum/core/scheduling";
import { moveInList, type TaskOrder } from "@momentum/core/tasks";
import { durationMinutes, nowInstant } from "@momentum/core/time";
import type { IanaTimeZone, Instant, LocalDate, Minutes, Task, Uuid } from "@momentum/core/types";

import type { TaskWorkBlock, TasksPageData } from "@/features/tasks/types";

/**
 * The optimistic overlay for the task manager, as a pure reducer.
 *
 * One overlay over the whole page state, patched per mutation — the shape Phase
 * 3 settled on for the calendar and for the same reason: several mutations act
 * on one list, and one `useOptimistic` per action would each hold a different
 * view of it.
 *
 * Everything here is pure and total. On success `refresh()` re-renders with
 * server truth and the overlay is discarded; **on failure the transition
 * settles against unchanged props and React discards the optimistic value on
 * its own** — there is no revert written here, and therefore none to get wrong
 * (Domain Rule 11).
 *
 * Completion is the one to read closely. A completed task leaves TODAY and
 * appears in COMPLETED because the views are recomputed from the patched list,
 * not because anything moves it: the patch sets two fields, and the six pure
 * predicates do the rest. Its work blocks are deliberately untouched
 * (Domain Rule 13).
 */

export type TaskPatch =
  | { kind: "create"; task: Task }
  | { kind: "update"; id: Uuid; fields: Partial<Task> }
  | { kind: "completion"; ids: readonly Uuid[]; completed: boolean }
  | { kind: "delete"; ids: readonly Uuid[] }
  | { kind: "move-project"; ids: readonly Uuid[]; projectId: Uuid | null }
  | { kind: "reorder"; orders: readonly TaskOrder[] }
  | { kind: "add-block"; taskId: Uuid; block: TaskWorkBlock }
  | { kind: "update-block"; taskId: Uuid; blockId: Uuid; span: BlockSpan }
  | { kind: "remove-block"; taskId: Uuid; blockId: Uuid };

export interface BlockSpan {
  date: LocalDate;
  startMinutes: Minutes;
  endMinutes: Minutes;
}

export function applyTaskPatch(
  state: TasksPageData,
  patch: TaskPatch,
  timezone: IanaTimeZone,
): TasksPageData {
  switch (patch.kind) {
    /*
     * Client-generated ids (Domain Rule 17) mean the optimistic row and the
     * persisted row share a key, so a retry cannot produce a duplicate and the
     * server's version replaces this one in place.
     */
    case "create":
      return {
        ...state,
        tasks: state.tasks.some((task) => task.id === patch.task.id)
          ? state.tasks.map((task) => (task.id === patch.task.id ? patch.task : task))
          : [...state.tasks, patch.task],
      };

    case "update":
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === patch.id ? { ...task, ...patch.fields } : task,
        ),
      };

    /*
     * The completion patch, and the reason the whole page is one overlay.
     *
     * `completedAt` is set from the client's clock for display only — the
     * database stamps the real one with `now()` inside `complete_task`, and
     * that value replaces this one on reconcile (Domain Rule 15). Blocks are
     * untouched: completing a task from a list completes the task and nothing
     * else (Domain Rule 13).
     */
    case "completion": {
      const ids = new Set(patch.ids);
      const at: Instant | null = patch.completed ? nowInstant() : null;

      return {
        ...state,
        tasks: state.tasks.map((task) =>
          ids.has(task.id)
            ? { ...task, status: patch.completed ? "completed" : "open", completedAt: at }
            : task,
        ),
      };
    }

    /*
     * Deleting a task takes its subtasks and its work blocks with it, because
     * that is what the database's cascade will do a moment later. An overlay
     * that removed only the row would show orphaned subtasks until the refresh
     * landed, which is the divergence Domain Rule 11 is about.
     */
    case "delete": {
      const ids = new Set(patch.ids);
      const removed = state.tasks.filter(
        (task) => ids.has(task.id) || (task.parentTaskId !== null && ids.has(task.parentTaskId)),
      );
      const removedIds = new Set(removed.map((task) => task.id));

      return {
        ...state,
        tasks: state.tasks.filter((task) => !removedIds.has(task.id)),
        workBlocks: withoutTasks(state.workBlocks, removedIds),
      };
    }

    /*
     * Moving to a project moves the subtasks too: `enforce_subtask_depth()`
     * rewrites a subtask's `project_id` to its parent's on every write, so a
     * subtask can never be in a different project from its parent. The overlay
     * shows what the database will hold.
     */
    case "move-project": {
      const ids = new Set(patch.ids);
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          ids.has(task.id) || (task.parentTaskId !== null && ids.has(task.parentTaskId))
            ? { ...task, projectId: patch.projectId }
            : task,
        ),
      };
    }

    /*
     * A reorder applies the very numbers the action persists — computed once,
     * by `sortOrdersForMove`, and handed to both — so the optimistic order and
     * the reconciled order cannot differ. One row in the ordinary case; the
     * whole tied run when the row's two new neighbours share a number.
     */
    case "reorder": {
      const orders = new Map(patch.orders.map((order) => [order.id, order.sortOrder]));
      if (orders.size === 0) return state;

      return {
        ...state,
        tasks: state.tasks.map((task) => {
          const sortOrder = orders.get(task.id);
          return sortOrder === undefined ? task : { ...task, sortOrder };
        }),
      };
    }

    /* A task gains one more block. Adding a second does not replace the first. */
    case "add-block":
      return {
        ...state,
        workBlocks: {
          ...state.workBlocks,
          [patch.taskId]: sortBlocks([
            ...(state.workBlocks[patch.taskId] ?? []).filter((b) => b.id !== patch.block.id),
            patch.block,
          ]),
        },
      };

    case "update-block":
      return {
        ...state,
        workBlocks: {
          ...state.workBlocks,
          [patch.taskId]: sortBlocks(
            (state.workBlocks[patch.taskId] ?? []).map((block) =>
              block.id === patch.blockId ? { ...block, ...blockFrom(patch.span, timezone) } : block,
            ),
          ),
        },
      };

    /* Removing a block never touches the task (Domain Rule 13). */
    case "remove-block":
      return {
        ...state,
        workBlocks: {
          ...state.workBlocks,
          [patch.taskId]: (state.workBlocks[patch.taskId] ?? []).filter(
            (block) => block.id !== patch.blockId,
          ),
        },
      };
  }
}

/**
 * The block a wall-clock span will become.
 *
 * The instants are built from the client's clock and the profile timezone, and
 * are display-only: the server recomputes them from the same `(date, minutes)`
 * pair and its answer replaces this one on reconcile. What keeps the optimistic
 * block the same length as the persisted one, including across a DST boundary,
 * is `intervalOfSlot` — the single implementation of that rule, the one the
 * server's `spanInstants` follows (Domain Rule 5).
 *
 * Two bare `fromLocal` calls are only its first half, and the half they omit is
 * the one that bites: a span straddling the far edge of a spring-forward gap
 * resolves out of order, so a block moved onto 02:30–03:00 on a spring-forward
 * morning took a *negative* `minutes` into the task's live coverage and drew as
 * an inverted, invisible row, while the row the server wrote was an ordinary
 * thirty minutes. `minutes` is therefore read off the resolved pair, never off
 * the two raw conversions, and this file holds no copy of the rule to keep in
 * step.
 */
export function blockFrom(
  span: BlockSpan,
  timezone: IanaTimeZone,
): Omit<TaskWorkBlock, "id" | "completedAt"> {
  const { startAt, endAt } = intervalOfSlot(span, timezone);

  return {
    startAt,
    endAt,
    date: span.date,
    startMinutes: span.startMinutes,
    endMinutes: span.endMinutes,
    minutes: durationMinutes(startAt, endAt),
  };
}

/** A new block, ready for the overlay and for `addWorkBlock`. */
export function newBlock(id: Uuid, span: BlockSpan, timezone: IanaTimeZone): TaskWorkBlock {
  return { id, completedAt: null, ...blockFrom(span, timezone) };
}

function sortBlocks(blocks: readonly TaskWorkBlock[]): TaskWorkBlock[] {
  return [...blocks].sort((a, b) => (a.startAt < b.startAt ? -1 : a.startAt > b.startAt ? 1 : 0));
}

function withoutTasks(
  workBlocks: TasksPageData["workBlocks"],
  removed: ReadonlySet<Uuid>,
): TasksPageData["workBlocks"] {
  const next: TasksPageData["workBlocks"] = {};
  for (const [taskId, blocks] of Object.entries(workBlocks)) {
    if (!removed.has(taskId)) next[taskId] = blocks;
  }
  return next;
}

/**
 * The list as the user would see it after a keyboard or drag reorder, used to
 * announce the move and to compute the target index. Kept next to the patch so
 * the two cannot disagree about what "index 3" means.
 */
export function reorderedPreview(ordered: readonly Task[], id: Uuid, toIndex: number): Task[] {
  return moveInList(ordered, id, toIndex);
}
