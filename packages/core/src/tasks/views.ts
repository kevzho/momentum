import type { Task, TaskPriority } from "../types/task";
import type { LocalDate, Uuid } from "../types/scalars";

/**
 * The task views as pure predicates over one list. TODAY and UPCOMING filter
 * on `dueDate`, the deadline, and say nothing about when work is booked
 * (Domain Rule 1); nothing here reads a work block.
 */

export const TASK_VIEWS = [
  "inbox",
  "today",
  "upcoming",
  "all",
  "completed",
  "project",
  "archived",
] as const;
export type TaskView = (typeof TASK_VIEWS)[number];

export function isTaskView(value: string): value is TaskView {
  return (TASK_VIEWS as readonly string[]).includes(value);
}

export interface ViewContext {
  /** Today in the user's timezone. */
  today: LocalDate;
  /** The project being shown. Only the `project` view reads it. */
  projectId?: Uuid | null;
}

/** Whether a task belongs in a view. Subtasks are excluded everywhere (shown inside their parent); archived tasks appear only in ARCHIVED. */
export function matchesView(task: Task, view: TaskView, context: ViewContext): boolean {
  if (task.parentTaskId !== null) return false;

  const archived = task.status === "archived" || task.archivedAt !== null;
  if (view === "archived") return archived;
  if (archived) return false;

  switch (view) {
    // INBOX is "captured but not filed": open work with no project.
    case "inbox":
      return task.status === "open" && task.projectId === null;

    // TODAY includes overdue.
    case "today":
      return task.status === "open" && task.dueDate !== null && task.dueDate <= context.today;

    // Strictly after today.
    case "upcoming":
      return task.status === "open" && task.dueDate !== null && task.dueDate > context.today;

    case "all":
      return task.status === "open";

    case "completed":
      return task.status === "completed";

    case "project":
      return (
        task.status === "open" &&
        context.projectId !== undefined &&
        context.projectId !== null &&
        task.projectId === context.projectId
      );
  }
}

export function filterByView(tasks: readonly Task[], view: TaskView, context: ViewContext): Task[] {
  return tasks.filter((task) => matchesView(task, view, context));
}

/** Answered by "does this task own a work block", never by a column on the task (Domain Rule 2); the caller passes the ids that do. */
export type ScheduledFilter = "any" | "scheduled" | "unscheduled";

/** A priority to narrow to, or `null` for "any". */
export type TaskPriorityFilter = TaskPriority | null;

export interface TaskFilter {
  priority: TaskPriorityFilter;
  projectId: Uuid | null;
  scheduled: ScheduledFilter;
  /** Case-insensitive substring of the title. */
  search: string;
}

export const EMPTY_FILTER: TaskFilter = {
  priority: null,
  projectId: null,
  scheduled: "any",
  search: "",
};

export function isEmptyFilter(filter: TaskFilter): boolean {
  return (
    filter.priority === null &&
    filter.projectId === null &&
    filter.scheduled === "any" &&
    filter.search.trim() === ""
  );
}

export function matchesFilter(
  task: Task,
  filter: TaskFilter,
  scheduledTaskIds: ReadonlySet<Uuid>,
): boolean {
  if (filter.priority !== null && task.priority !== filter.priority) return false;
  if (filter.projectId !== null && task.projectId !== filter.projectId) return false;

  if (filter.scheduled !== "any") {
    const isScheduled = scheduledTaskIds.has(task.id);
    if (filter.scheduled === "scheduled" && !isScheduled) return false;
    if (filter.scheduled === "unscheduled" && isScheduled) return false;
  }

  const search = filter.search.trim().toLowerCase();
  if (search !== "" && !task.title.toLowerCase().includes(search)) return false;

  return true;
}

/** The view and the toolbar in one pass, in that order: a filter narrows a view, never widens it. */
export function selectTasks(
  tasks: readonly Task[],
  view: TaskView,
  context: ViewContext,
  filter: TaskFilter = EMPTY_FILTER,
  scheduledTaskIds: ReadonlySet<Uuid> = new Set(),
): Task[] {
  return tasks.filter(
    (task) => matchesView(task, view, context) && matchesFilter(task, filter, scheduledTaskIds),
  );
}
