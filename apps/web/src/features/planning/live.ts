import { MIN_BLOCK_MINUTES } from "@momentum/core/calendar";
import type { Commitment, PlanningContext, PlanningTask } from "@momentum/core/scheduling";
import type { LocalDate, Minutes } from "@momentum/core/types";

import { DEFAULT_TASK_BLOCK_MINUTES } from "@/features/calendar/dnd";
import type {
  CalendarItem,
  CalendarSettings,
  PlanTask,
  PlanningData,
} from "@/features/calendar/types";

/**
 * The drawer's view of the week, derived from `plan` and the optimistic
 * `items` and never stored, so every number moves with a drop and rolls back
 * with it. No date maths here; that is `@momentum/core/scheduling`'s.
 */

/** Every item on the board as the scheduler sees it. All-day items map too; `occupiesTime` ignores them. */
export function commitmentsOf(items: readonly CalendarItem[]): Commitment[] {
  return items.map((item) => ({
    id: item.id,
    kind: item.kind,
    title: item.title,
    startAt: item.startAt,
    endAt: item.endAt,
    allDay: item.allDay,
    completedAt: item.completedAt,
    taskId: item.work?.taskId ?? null,
    taskDueDate: item.work?.taskDueDate ?? null,
    taskCompletedAt: item.work?.taskCompletedAt ?? null,
  }));
}

/** The scheduler's projection of a drawer row. */
export function planningTaskOf(task: PlanTask): PlanningTask {
  return {
    id: task.id,
    title: task.title,
    estimatedMinutes: task.estimatedMinutes,
    dueDate: task.dueDate,
    scheduledOutsideMinutes: task.scheduledOutsideMinutes,
  };
}

/**
 * The block length every scheduling route creates. Never shorter than
 * `MIN_BLOCK_MINUTES`, which the editor and a resize would refuse.
 */
export function taskBlockMinutes(task: PlanTask): Minutes {
  return Math.max(MIN_BLOCK_MINUTES, task.estimatedMinutes ?? DEFAULT_TASK_BLOCK_MINUTES);
}

export interface LiveSections {
  overdue: readonly PlanTask[];
  dueInRange: readonly PlanTask[];
  unscheduled: readonly PlanTask[];
}

/**
 * The sections as the user sees them right now: a task leaves UNSCHEDULED the
 * moment the overlay holds a block for it. The other two sections are
 * unaffected, since a block does not change a deadline.
 */
export function liveSections(plan: PlanningData, commitments: readonly Commitment[]): LiveSections {
  const scheduled = new Set<string>();
  for (const commitment of commitments) {
    if (commitment.taskId !== null) scheduled.add(commitment.taskId);
  }
  return {
    overdue: plan.overdue,
    dueInRange: plan.dueInRange,
    unscheduled: plan.unscheduled.filter((task) => !scheduled.has(task.id)),
  };
}

/**
 * Every task competing for the range, once each. Built from the server's
 * sections, not the live ones: a task that just left UNSCHEDULED still has the
 * rest of its estimate outstanding.
 */
export function planningTasksOf(plan: PlanningData): PlanningTask[] {
  const seen = new Set<string>();
  const tasks: PlanningTask[] = [];
  for (const task of [...plan.overdue, ...plan.dueInRange, ...plan.unscheduled]) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    tasks.push(planningTaskOf(task));
  }
  return tasks;
}

export function planningContextOf(
  plan: PlanningData,
  settings: CalendarSettings,
  days: readonly LocalDate[],
  today: LocalDate,
): PlanningContext {
  return {
    timezone: settings.timezone,
    workingHours: plan.workingHours,
    focusWindows: plan.focusWindows,
    days,
    today,
  };
}
