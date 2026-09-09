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

// One `useOptimisticAction` for every mutation: several `useOptimistic` calls
// over the same list would each hold a different view of it. Rollback is the
// mechanism's; no revert is written here.

/** A patch and the call that persists it, dispatched together. */
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
  unarchive: (id: Uuid) => void;
  /** Places `id` at `toIndex` of `ordered`. Returns whether a write was issued. */
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
  /** The most recent failure, until the next write; for surfaces a toast cannot reach. */
  failure: TaskFailure | null;
  mutate: TaskMutations;
} {
  const { timezone } = useUserSettings();

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

      // Archiving hides the task from every view, so the overlay removes it.
      archive: (id) =>
        dispatch({
          patch: { kind: "delete", ids: [id] },
          touched: [id],
          run: () => archiveTask({ id, archived: true }),
        }),

      unarchive: (id) =>
        dispatch({
          patch: { kind: "update", id, fields: { status: "open", archivedAt: null } },
          touched: [id],
          run: () => archiveTask({ id, archived: false }),
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

      // Id generated here so the optimistic block and the persisted row share a key.
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
          // `enforce_subtask_depth()` rewrites this to the parent's on write.
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

// A `Partial<Task>` reduced to the fields `updateTaskInput` accepts, so a
// guarded column can never be sent to an action that would refuse it.
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

// One step past the last sibling.
function nextSortOrder(tasks: readonly Task[], parentId: Uuid): number {
  const siblings = tasks.filter((task) => task.parentTaskId === parentId);
  return siblings.reduce((max, task) => Math.max(max, task.sortOrder), 0) + 1;
}
