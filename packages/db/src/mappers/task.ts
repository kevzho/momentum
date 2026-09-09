import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@momentum/core/types";

import type { Row } from "../types";
import { oneOf, toInstant, toInstantOrNull, toLocalDateOrNull } from "./scalars";

export function rowToTask(row: Row<"tasks">): Task {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    parentTaskId: row.parent_task_id,
    title: row.title,
    description: row.description,
    status: oneOf<TaskStatus>(TASK_STATUSES, row.status, "tasks.status"),
    priority: oneOf<TaskPriority>(TASK_PRIORITIES, row.priority, "tasks.priority"),
    estimatedMinutes: row.estimated_minutes,
    actualMinutes: row.actual_minutes,
    dueDate: toLocalDateOrNull(row.due_date),
    completedAt: toInstantOrNull(row.completed_at),
    archivedAt: toInstantOrNull(row.archived_at),
    sortOrder: row.sort_order,
    createdAt: toInstant(row.created_at),
    updatedAt: toInstant(row.updated_at),
  };
}
