import { formatDuration, formatLocalDate } from "@momentum/core/time";
import type { LocalDate, Minutes, QuestMetric, TaskPriority } from "@momentum/core/types";

import type { PlanTask, PlanningGoal } from "@/features/calendar/types";

/**
 * Every string the planning drawer speaks. Facts only, never a judgement
 * about the person or the week (Domain Rule 7); `copy.test.ts` scans the
 * feature for words that would cross the line.
 */

export const DRAWER_TITLE = "Plan my week";

/** The `SidePanel` close control; matches the toggle on the calendar's page header. */
export const HIDE_DRAWER_LABEL = "Hide plan panel";

export const CAPACITY = {
  heading: "Capacity",
  planned: "Planned",
  available: "Available",
  unscheduled: "Unscheduled work",
} as const;

/** Available time is an estimate, so it carries a tilde. */
export const APPROXIMATE_PREFIX = "~";

export const WORKLOAD_HEADING = "Workload";

/** "Mon: 6h 30m planned, 8h of working hours." — a workload row for a screen reader. */
export function workloadRowLabel(input: {
  date: LocalDate;
  plannedMinutes: Minutes;
  workingMinutes: Minutes;
  isToday: boolean;
}): string {
  const day = `${formatLocalDate(input.date, "weekday")}${input.isToday ? ", today" : ""}`;
  const planned = `${formatDuration(input.plannedMinutes)} planned`;
  const working =
    input.workingMinutes > 0
      ? `${formatDuration(input.workingMinutes)} of working hours`
      : "no working hours";
  return `${day}: ${planned}, ${working}.`;
}

export const WARNINGS = {
  heading: "Warnings",
  none: "No warnings for this range.",
} as const;

export const SECTIONS = {
  overdue: {
    title: "Overdue",
    emptyTitle: "Nothing overdue",
    emptyDescription: "No open task is past its due date.",
  },
  dueInRange: {
    emptyTitle: "Nothing due",
    emptyDescription: "No open task is due in this range.",
  },
  unscheduled: {
    title: "Unscheduled",
    emptyTitle: "Everything has a time",
    emptyDescription: "No open task is waiting for a slot.",
  },
  habits: {
    title: "Habits",
    emptyTitle: "No habits yet",
    emptyDescription: "Habits you are keeping up appear here, competing for the same week.",
  },
  weeklyGoals: {
    title: "Weekly goals",
    emptyTitle: "No weekly goals",
    emptyDescription: "None are set for this week.",
  },
} as const;

export function dueInRangeTitle(dayCount: number): string {
  return dayCount === 1 ? "Due today" : "Due this week";
}

/** Must match `TaskRow` in `@momentum/ui`: P4 is "no priority set", not "lowest". */
export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  1: "Priority 1",
  2: "Priority 2",
  3: "Priority 3",
  4: "No priority",
};

export const DUE_PREFIX = "Due";

/** "45m of 2h scheduled". Null when nothing is scheduled; over-scheduling reads the same way. */
export function coverageLabel(
  scheduledMinutes: Minutes,
  estimatedMinutes: Minutes | null,
): string | null {
  if (scheduledMinutes <= 0) return null;
  if (estimatedMinutes === null) return `${formatDuration(scheduledMinutes)} scheduled`;
  return `${formatDuration(scheduledMinutes)} of ${formatDuration(estimatedMinutes)} scheduled`;
}

export function estimateLabel(estimatedMinutes: Minutes | null): string {
  return estimatedMinutes === null
    ? "no estimate"
    : `${formatDuration(estimatedMinutes)} estimated`;
}

/** The row's accessible name, composed in the order a sighted user reads it. */
export function planTaskLabel(task: PlanTask, scheduledMinutes: Minutes): string {
  const parts = [task.title];
  if (task.priority !== 4) parts.push(PRIORITY_LABEL[task.priority]);
  if (task.projectName !== null) parts.push(task.projectName);
  parts.push(estimateLabel(task.estimatedMinutes));
  if (task.dueDate !== null) parts.push(`due ${formatLocalDate(task.dueDate, "medium")}`);
  const coverage = coverageLabel(scheduledMinutes, task.estimatedMinutes);
  if (coverage !== null) parts.push(coverage);
  return parts.join(", ");
}

/** Rendered in the footer with `Kbd` glyphs between the pieces. */
export const KEYBOARD_HINT = {
  before: "Drag a task onto the week, press ",
  findKey: "F",
  between: " to find a time, or ",
  pickKey: "S",
  after: " to pick one.",
} as const;

export const GOAL_DONE = "Done";

function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

// What a goal asks for, when it has no title of its own.
const METRIC_LABEL: Record<QuestMetric, (target: number) => string> = {
  tasks_completed: (target) => `Complete ${count(target, "task")}`,
  priority_tasks_completed: (target) => `Complete ${count(target, "priority task")}`,
  focus_minutes: (target) => `Focus ${formatDuration(target)}`,
  habits_completed: (target) => `Complete ${count(target, "habit")}`,
  habit_days: (target) => `Complete habits on ${count(target, "day")}`,
  blocks_completed: (target) => `Complete ${count(target, "block")}`,
};

// The target in the metric's own unit: "10 tasks", "5h", "4 days".
const METRIC_TARGET: Record<QuestMetric, (target: number) => string> = {
  tasks_completed: (target) => count(target, "task"),
  priority_tasks_completed: (target) => count(target, "priority task"),
  focus_minutes: (target) => formatDuration(target),
  habits_completed: (target) => count(target, "habit"),
  habit_days: (target) => count(target, "day"),
  blocks_completed: (target) => count(target, "block"),
};

export function goalLabel(goal: PlanningGoal): string {
  return goal.title ?? METRIC_LABEL[goal.metric](goal.target);
}

export function goalTarget(metric: QuestMetric, target: number): string {
  return METRIC_TARGET[metric](target);
}

export const FIND_TIME = {
  title: "Find time",
  candidates: "Suggested times",
  schedule: "Schedule",
  pickManually: "Pick a time instead",
} as const;

export const SCHEDULE_TASK = {
  title: "Schedule task",
  date: "Date",
  start: "Start",
  duration: "Duration (minutes)",
  cancel: "Cancel",
  submit: "Schedule",
  pickDate: "Pick a date for this block.",
  pickStart: "Pick a start time.",
  pastMidnight: "That would run past midnight. Start earlier, or make the block shorter.",
} as const;

export function minimumBlockMessage(minimumMinutes: Minutes): string {
  return `A block is at least ${formatDuration(minimumMinutes)} long.`;
}
