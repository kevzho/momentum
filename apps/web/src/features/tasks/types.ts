import type {
  IanaTimeZone,
  Instant,
  LocalDate,
  Minutes,
  ProjectColor,
  Task,
  TaskPriority,
  Uuid,
} from "@momentum/core/types";

/**
 * What the server hands the task manager's client island.
 *
 * The island receives **all** of the user's unarchived tasks and computes the
 * six views itself, with the same pure predicates the server would have used
 * (`@momentum/core/tasks`). Three reasons, in order of weight:
 *
 * 1. The spec defines a view as "a filter over the same data". Filtering on the
 *    server and again on the client would be two implementations of one
 *    definition, and the one the tests cover would not be the one the user sees.
 * 2. Completing a task moves it between views. With the whole list present that
 *    is one optimistic patch and the views recompute; with per-view fetches it
 *    would be a patch plus a refetch, and the rollback would have to undo both.
 * 3. Switching view becomes free — no round trip, no spinner — which is what
 *    makes the six views feel like one list rather than six pages.
 *
 * The cost is bounded by one person's own task list, and `listFor` already
 * excludes the archived at the database.
 */
export interface TasksPageData {
  /** Resolved once per request in the profile timezone, never in the browser (Domain Rule 4). */
  today: LocalDate;
  timezone: IanaTimeZone;
  /** Top-level tasks and their subtasks, in one list. Views exclude subtasks; the sheet needs them. */
  tasks: Task[];
  /**
   * Every task's work blocks, keyed by task (Domain Rule 2: 0..n per task).
   * A task with no entry owns no blocks and is unscheduled — which is a fact
   * about `calendar_blocks`, never a column on the task.
   */
  workBlocks: Record<Uuid, TaskWorkBlock[]>;
  projects: ProjectSummary[];
}

/**
 * One reserved span, resolved for display.
 *
 * The minutes are computed on the server with `durationMinutes`, so the client
 * never subtracts two instants (Domain Rule 5), and the wall-clock fields are
 * resolved in the profile timezone so the sheet can show and edit them without
 * a second conversion.
 */
export interface TaskWorkBlock {
  id: Uuid;
  startAt: Instant;
  endAt: Instant;
  /** The day the block sits on, in the user's timezone. */
  date: LocalDate;
  startMinutes: Minutes;
  endMinutes: Minutes;
  /** Elapsed minutes — what the block actually costs the week (Domain Rule 3). */
  minutes: Minutes;
  /** "This span was executed." Says nothing about the task (Domain Rule 13). */
  completedAt: Instant | null;
}

export interface ProjectSummary {
  id: Uuid;
  name: string;
  color: ProjectColor;
}

export interface ProjectSummaryWithCount extends ProjectSummary {
  /** Open, unarchived, top-level tasks in this project — what the list will show. */
  openTasks: number;
}

/**
 * What the shell itself needs from the task manager: the project list for the
 * sidebar and for Quick Add, and "today" for Quick Add's date picker.
 *
 * Separate from `TasksPageData` because it is read on every authenticated
 * route, not only on `/tasks` — Quick Add is two keystrokes from anywhere, and
 * the sidebar is always on screen.
 */
export interface ShellTaskData {
  projects: ProjectSummaryWithCount[];
  today: LocalDate;
  /**
   * Every open task, as little of it as the palette needs. Read here because
   * the shell already reads the same rows for the sidebar's counts — the search
   * index costs no query, only the columns it names (Phase 11).
   */
  tasks: TaskSummary[];
  /**
   * The `sortOrder` Quick Add creates with: one step below the user's lowest
   * row, so a capture is the first thing in the Inbox rather than one more row
   * tied at `0` (`sortOrderBefore`). Computed here because Quick Add is
   * mounted in the shell and has no list of its own to look at.
   */
  newTaskSortOrder: number;
}

/**
 * A task as the command palette knows it: enough to find it, show it and act
 * on it, and nothing else.
 *
 * It is deliberately not a `Task`. The palette is mounted on every route, so
 * its data crosses the server/client boundary on every load; sending
 * descriptions, timestamps and sort orders that nothing renders would make the
 * shell pay for the task manager on pages that have no task list.
 */
export interface TaskSummary {
  id: Uuid;
  title: string;
  projectId: Uuid | null;
  priority: TaskPriority;
  dueDate: LocalDate | null;
}
