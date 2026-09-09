import type { Instant, LocalDate, Minutes, Uuid } from "./scalars";

export const TASK_STATUSES = ["open", "completed", "archived"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** `1` is highest. `4` is the default and means "no priority set". */
export const TASK_PRIORITIES = [1, 2, 3, 4] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/**
 * A unit of work. Deliberately carries NO scheduling columns: when a task is
 * worked on lives in its work blocks (`WorkBlock`, 0..n per task) — Domain Rule 2.
 * `dueDate` is a deadline, not a schedule (Domain Rule 1).
 */
export interface Task {
  id: Uuid;
  userId: Uuid;
  projectId: Uuid | null;
  /** Subtasks are tasks with a parent. One level deep only. */
  parentTaskId: Uuid | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  /** User intent. Never overwritten by actuals (Domain Rule 3). */
  estimatedMinutes: Minutes | null;
  /** Derived from completed focus sessions by trusted database logic. Never user-typed. */
  actualMinutes: Minutes;
  /** A calendar date in the user's timezone: "due Friday", not "due at an instant". */
  dueDate: LocalDate | null;
  completedAt: Instant | null;
  archivedAt: Instant | null;
  /** Manual ordering within a list; fractional to allow midpoint inserts. */
  sortOrder: number;
  createdAt: Instant;
  updatedAt: Instant;
}
