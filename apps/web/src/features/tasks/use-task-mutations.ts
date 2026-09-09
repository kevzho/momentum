"use client";

import * as React from "react";

import type { Task, Uuid } from "@momentum/core/types";
import { nowInstant } from "@momentum/core/time";
import { sortOrdersForMove } from "@momentum/core/tasks";

import {
  addWorkBlock,
  archiveTask,
  bulkDeleteTasks,
  bulkMoveToProject,
  bulkSetCompletion,
  createTask,
  deleteTask,
  removeWorkBlock,
  reorderTask,
  setTaskCompletion,
  updateTask,
  updateWorkBlock,
} from "@/features/tasks/actions";
import {
  applyTaskPatch,
  newBlock,
  type BlockSpan,
  type TaskPatch,
} from "@/features/tasks/optimistic";
import type { TasksPageData } from "@/features/tasks/types";
import { useOptimisticAction } from "@/lib/actions/use-optimistic-action";
import type { ActionError, ActionResult } from "@/lib/actions/result";
import { useUserSettings } from "@/lib/time/user-settings";

/**
 * Every task mutation, over one optimistic overlay.
 *
 * `useOptimisticAction` is the product's one optimistic mechanism
 * (docs/ARCHITECTURE.md §8) and its contract is one action per hook. The task
 * manager has thirteen mutations over one list, and thirteen `useOptimistic`
 * calls over the same array would each hold a different view of it — the list
 * can only render one. So this is the calendar's arrangement applied here: a
 * single hook whose `action` dispatches on the patch and whose `optimistic` is
 * the pure reducer in `optimistic.ts`.
 *
 * Rollback is still the mechanism's, not this file's: on failure the transition
 * settles against unchanged props and React discards the overlay. There is no
 * revert written anywhere in this feature, which is precisely why there is none
 * to get wrong (Domain Rule 11).
 */

/** A patch and the call that persists it, dispatched together so they cannot diverge. */
interface Mutation {
  patch: TaskPatch;
  run: () => Promise<ActionResult<unknown>>;
  /** Rows to show as in-flight. */
  touched: readonly Uuid[];
}

export interface TaskMutations {
  create: (task: Task) => void;
  update: (id: Uuid, fields: Partial<Task>) => void;
  setCompletion: (id: Uuid, completed: boolean) => void;
  remove: (id: Uuid) => void;
  archive: (id: Uuid) => void;
  /**
   * Places `id` at `toIndex` of `ordered`. Answers whether a write was issued:
   * a move that changes nothing writes nothing, and the caller must not
   * announce a move that did not happen.
   */
  reorder: (id: Uuid, ordered: readonly Task[], toIndex: number) => boolean;
  bulkComplete: (ids: readonly Uuid[], completed: boolean) => void;
  bulkMove: (ids: readonly Uuid[], projectId: Uuid | null) => void;
  bulkDelete: (ids: readonly Uuid[]) => void;
  addBlock: (taskId: Uuid, span: BlockSpan) => void;
  updateBlock: (taskId: Uuid, blockId: Uuid, span: BlockSpan) => void;
  removeBlock: (taskId: Uuid, blockId: Uuid) => void;
  addSubtask: (parentId: Uuid, title: string) => void;
}

/** The last write that was refused, and the rows it was about. */
export interface TaskFailure {
  error: ActionError;
  ids: readonly Uuid[];
}

export function useTaskMutations(serverState: TasksPageData): {
  state: TasksPageData;
  pending: boolean;
  pendingIds: ReadonlySet<Uuid>;
  /**
   * The most recent failure, until the next write is dispatched. The toast
   * carries it too; this is for the surface that owns the rows — the detail
   * sheet renders a validation message next to the fields it rolled back,
   * where a toast behind a modal sheet cannot be read or reached.
   */
  failure: TaskFailure | null;
  mutate: TaskMutations;
} {
  const { timezone } = useUserSettings();

  /*
   * The ids of rows with a write in flight, for the "pending" affordance.
   * Cleared when the transition settles — success or failure — because the row
   * is either reconciled or rolled back, and either way it is no longer
   * in flight.
   */
  const [pendingIds, setPendingIds] = React.useState<ReadonlySet<Uuid>>(new Set());
  const [failure, setFailure] = React.useState<TaskFailure | null>(null);

  const { state, run, pending } = useOptimisticAction<TasksPageData, Mutation, unknown>({
    serverState,
    optimistic: (current, mutation) => applyTaskPatch(current, mutation.patch, timezone),
    action: (mutation) => mutation.run(),
    onSuccess: (_data, mutation) => release(mutation.touched),
    onError: (error, mutation) => {
      release(mutation.touched);
      setFailure({ error, ids: mutation.touched });
    },
  });

  function release(ids: readonly Uuid[]): void {
    setPendingIds((current) => {
      const next = new Set(current);
      for (const id of ids) next.delete(id);
      return next;
    });
  }

  const dispatch = React.useCallback(
    (mutation: Mutation) => {
      setPendingIds((current) => new Set([...current, ...mutation.touched]));
      setFailure(null);
      run(mutation);
    },
    [run],
  );

  const mutate = React.useMemo<TaskMutations>(
    () => ({
      create: (task) =>
        dispatch({
          patch: { kind: "create", task },
          touched: [task.id],
          run: () =>
            createTask({
              id: task.id,
              title: task.title,
              description: task.description,
              projectId: task.projectId,
              parentTaskId: task.parentTaskId,
              priority: task.priority,
              estimatedMinutes: task.estimatedMinutes,
              dueDate: task.dueDate,
              sortOrder: task.sortOrder,
            }),
        }),

      update: (id, fields) =>
        dispatch({
          patch: { kind: "update", id, fields },
          touched: [id],
          run: () => updateTask({ id, ...serialisable(fields) }),
        }),

      setCompletion: (id, completed) =>
        dispatch({
          patch: { kind: "completion", ids: [id], completed },
          touched: [id],
          run: () => setTaskCompletion({ id, completed }),
        }),

      remove: (id) =>
        dispatch({
          patch: { kind: "delete", ids: [id] },
          touched: [id],
          run: () => deleteTask({ id }),
        }),

      /*
       * Archiving hides the task from every view, so the overlay removes it
       * from the list — which is what `matchesView` will decide a moment later
       * from the persisted row anyway.
       */
      archive: (id) =>
        dispatch({
          patch: { kind: "delete", ids: [id] },
          touched: [id],
          run: () => archiveTask({ id, archived: true }),
        }),

      reorder: (id, ordered, toIndex) => {
        const orders = sortOrdersForMove(ordered, id, toIndex);
        if (orders.length === 0) return false;

        dispatch({
          patch: { kind: "reorder", orders },
          touched: [id],
          run: () => reorderTask({ orders }),
        });
        return true;
      },

      bulkComplete: (ids, completed) =>
        dispatch({
          patch: { kind: "completion", ids, completed },
          touched: ids,
          run: () => bulkSetCompletion({ ids, completed }),
        }),

      bulkMove: (ids, projectId) =>
        dispatch({
          patch: { kind: "move-project", ids, projectId },
          touched: ids,
          run: () => bulkMoveToProject({ ids, projectId }),
        }),

      bulkDelete: (ids) =>
        dispatch({
          patch: { kind: "delete", ids },
          touched: ids,
          run: () => bulkDeleteTasks({ ids }),
        }),

      /*
       * A work block. The id is generated here so the optimistic block and the
       * persisted row share a key and a retry collides with itself
       * (Domain Rule 17). Adding a second block to a task does not replace the
       * first — the whole point of Domain Rule 2.
       */
      addBlock: (taskId, span) => {
        const id = crypto.randomUUID();
        dispatch({
          patch: { kind: "add-block", taskId, block: newBlock(id, span, timezone) },
          touched: [taskId],
          run: () => addWorkBlock({ id, taskId, ...span }),
        });
      },

      updateBlock: (taskId, blockId, span) =>
        dispatch({
          patch: { kind: "update-block", taskId, blockId, span },
          touched: [taskId],
          run: () => updateWorkBlock({ id: blockId, ...span }),
        }),

      removeBlock: (taskId, blockId) =>
        dispatch({
          patch: { kind: "remove-block", taskId, blockId },
          touched: [taskId],
          run: () => removeWorkBlock({ id: blockId }),
        }),

      addSubtask: (parentId, title) => {
        const id = crypto.randomUUID();
        const now = nowInstant();
        const parent = serverState.tasks.find((task) => task.id === parentId);

        const subtask: Task = {
          id,
          userId: parent?.userId ?? "",
          // `enforce_subtask_depth()` rewrites this to the parent's on write;
          // matching it here keeps the optimistic row and the persisted one the
          // same shape.
          projectId: parent?.projectId ?? null,
          parentTaskId: parentId,
          title,
          description: null,
          status: "open",
          priority: 4,
          estimatedMinutes: null,
          actualMinutes: 0,
          dueDate: null,
          completedAt: null,
          archivedAt: null,
          sortOrder: nextSortOrder(serverState.tasks, parentId),
          createdAt: now,
          updatedAt: now,
        };

        dispatch({
          patch: { kind: "create", task: subtask },
          touched: [id],
          run: () =>
            createTask({
              id,
              title,
              parentTaskId: parentId,
              projectId: subtask.projectId,
              priority: 4,
              estimatedMinutes: null,
              dueDate: null,
              description: null,
              sortOrder: subtask.sortOrder,
            }),
        });
      },
    }),
    [dispatch, timezone, serverState.tasks],
  );

  return { state, pending, pendingIds, failure, mutate };
}

/**
 * A `Partial<Task>` reduced to the fields `updateTaskInput` accepts.
 *
 * The sheet edits domain objects; the action takes a narrow patch. Filtering
 * here rather than at each call site means a future field added to `Task` — an
 * `actualMinutes` recomputed by a focus session, say — cannot accidentally be
 * sent to an action that would refuse it (Domain Rule 15).
 */
function serialisable(fields: Partial<Task>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (fields.title !== undefined) patch.title = fields.title;
  if (fields.description !== undefined) patch.description = fields.description;
  if (fields.projectId !== undefined) patch.projectId = fields.projectId;
  if (fields.priority !== undefined) patch.priority = fields.priority;
  if (fields.estimatedMinutes !== undefined) patch.estimatedMinutes = fields.estimatedMinutes;
  if (fields.dueDate !== undefined) patch.dueDate = fields.dueDate;
  return patch;
}

/** One step past the last sibling, so a new subtask lands at the bottom of its list. */
function nextSortOrder(tasks: readonly Task[], parentId: Uuid): number {
  const siblings = tasks.filter((task) => task.parentTaskId === parentId);
  return siblings.reduce((max, task) => Math.max(max, task.sortOrder), 0) + 1;
}
