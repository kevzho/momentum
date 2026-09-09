import { intervalOfSlot } from "@momentum/core/scheduling";
import { moveInList, type TaskOrder } from "@momentum/core/tasks";
import { durationMinutes, nowInstant } from "@momentum/core/time";
import type { IanaTimeZone, Instant, LocalDate, Minutes, Task, Uuid } from "@momentum/core/types";

import type { TaskWorkBlock, TasksPageData } from "@/features/tasks/types";

// One pure overlay over the whole page state. There is no revert: on failure
// the transition settles against unchanged props and React discards the overlay.

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
    // Client-generated ids: a retry replaces the row in place rather than duplicating it.
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

    // `completedAt` is display-only; `complete_task` stamps the real one.
    // Blocks are deliberately untouched.
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

    // Subtasks and work blocks go too, matching the database's cascade.
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

    // Subtasks move too: `enforce_subtask_depth()` rewrites their `project_id`
    // to the parent's on every write.
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

    // Applies the very numbers the action persists (`sortOrdersForMove`).
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

    // Removing a block never touches the task.
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
 * The display-only block a wall-clock span will become. Must go through
 * `intervalOfSlot` (the rule the server's `spanInstants` follows), not two bare
 * `fromLocal` calls: a span on the far edge of a spring-forward gap would
 * otherwise resolve out of order and yield negative `minutes`.
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

/** The list after a reorder, for announcing the move and computing the target index. */
export function reorderedPreview(ordered: readonly Task[], id: Uuid, toIndex: number): Task[] {
  return moveInList(ordered, id, toIndex);
}
