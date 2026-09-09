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
 * The island receives all of the user's tasks and computes every view itself
 * with the predicates in `@momentum/core/tasks`; there is no per-view query.
 */
export interface TasksPageData {
  /** Resolved once per request in the profile timezone, never in the browser. */
  today: LocalDate;
  timezone: IanaTimeZone;
  /** Top-level tasks and their subtasks, in one list. Views exclude subtasks; the sheet needs them. */
  tasks: Task[];
  /** 0..n per task; a task with no entry is unscheduled. */
  workBlocks: Record<Uuid, TaskWorkBlock[]>;
  projects: ProjectSummary[];
}

/** One reserved span, with wall-clock fields resolved server-side in the profile timezone. */
export interface TaskWorkBlock {
  id: Uuid;
  startAt: Instant;
  endAt: Instant;
  /** The day the block sits on, in the user's timezone. */
  date: LocalDate;
  startMinutes: Minutes;
  endMinutes: Minutes;
  /** Elapsed minutes, not wall-clock difference. */
  minutes: Minutes;
  /** "This span was executed." Says nothing about the task. */
  completedAt: Instant | null;
}

export interface ProjectSummary {
  id: Uuid;
  name: string;
  color: ProjectColor;
}

export interface ProjectSummaryWithCount extends ProjectSummary {
  /** Open, unarchived, top-level tasks in this project. */
  openTasks: number;
}

/** What the shell needs on every authenticated route, for the sidebar, Quick Add and the palette. */
export interface ShellTaskData {
  projects: ProjectSummaryWithCount[];
  today: LocalDate;
  /** Every open task, as little of it as the palette needs. */
  tasks: TaskSummary[];
  /** The `sortOrder` Quick Add creates with: one step below the user's lowest row (`sortOrderBefore`). */
  newTaskSortOrder: number;
}

/** Deliberately not a `Task`: the palette's data crosses the server/client boundary on every route. */
export interface TaskSummary {
  id: Uuid;
  title: string;
  projectId: Uuid | null;
  priority: TaskPriority;
  dueDate: LocalDate | null;
}
