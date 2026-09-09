import type { Task, TaskPriority } from "../types/task";
import type { LocalDate, Uuid } from "../types/scalars";

/**
 * The six views, as pure predicates over one list (specs/04-task-manager.md).
 *
 * Every view is a filter over the same data — there is no per-view query and no
 * per-view table — so the definitions live here, framework-free and
 * exhaustively testable, rather than as six `.eq()` chains that drift apart.
 *
 * Two rules run through all of them:
 *
 * **A due date is not a schedule (Domain Rule 1).** TODAY and UPCOMING sort and
 * filter on `dueDate` — the deadline — and say nothing about when the work is
 * booked. A task due Friday that is being worked on Monday is in UPCOMING all
 * week; its Monday block is on the calendar, which is a different surface
 * answering a different question. Nothing in this file reads a work block.
 *
 * **`today` is a parameter.** It is resolved once per request in the profile
 * timezone and passed in; nothing here reads a clock (Domain Rule 4).
 */

export const TASK_VIEWS = ["inbox", "today", "upcoming", "all", "completed", "project"] as const;
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

/**
 * Whether a task belongs in a view.
 *
 * Subtasks are excluded everywhere: they belong to their parent and are shown
 * inside it, so a list that also showed them at top level would show the same
 * work twice and let a user complete it from two places with different meanings.
 *
 * Archived tasks appear in no view. Archiving is the "not now, not deleted"
 * escape hatch; a row that reappeared in ALL would make it useless.
 */
export function matchesView(task: Task, view: TaskView, context: ViewContext): boolean {
  if (task.parentTaskId !== null) return false;
  if (task.status === "archived" || task.archivedAt !== null) return false;

  switch (view) {
    /*
     * INBOX is "captured but not filed": open work with no project. This is the
     * recommendation the roadmap's open question left to this phase, and it
     * matches what Quick Add produces from a title alone — so the fastest
     * capture path always lands somewhere the user will see it again.
     */
    case "inbox":
      return task.status === "open" && task.projectId === null;

    /*
     * TODAY includes overdue. A task that was due yesterday and is still open is
     * more today's problem than today's own tasks are, and a view that hid it
     * until the user went looking in ALL would be actively harmful. The row
     * tells the two apart by tone, not by hiding one.
     */
    case "today":
      return task.status === "open" && task.dueDate !== null && task.dueDate <= context.today;

    /** Strictly after today: what is coming, not what has arrived. */
    case "upcoming":
      return task.status === "open" && task.dueDate !== null && task.dueDate > context.today;

    case "all":
      return task.status === "open";

    case "completed":
      return task.status === "completed";

    /*
     * A project view shows the project's open work. Its completed tasks are in
     * COMPLETED, which is the one view that answers "what did I finish".
     */
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

/* -------------------------------------------------------------------------- */
/* The toolbar's filters, applied on top of the view                          */
/* -------------------------------------------------------------------------- */

/**
 * Scheduled-ness is a filter, never a view, and it is answered by "does this
 * task own a work block" — never by a column on the task (Domain Rule 2). The
 * caller passes the set of task ids that own at least one block, because that
 * fact lives in `calendar_blocks` and this module does not read rows.
 */
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
