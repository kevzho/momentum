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
 * The drawer's view of the week, derived — never stored.
 *
 * The board hands the drawer two things: the server's sections (`plan`) and
 * the week as the user sees it right now (`items`, the optimistic overlay).
 * Every number the drawer shows comes from those two through the pure
 * functions below and `@momentum/core/scheduling`; nothing is kept in state
 * and nothing waits for a refresh. That is what makes a total, a bar, a
 * coverage label or a warning move in the same frame as the drop that changed
 * it, and roll back with it when the write fails (Domain Rule 11).
 *
 * None of this does date maths. The projections are field-for-field, and the
 * arithmetic happens in `@momentum/core/scheduling` against the profile
 * timezone carried in the context (Domain Rules 4 and 5).
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

/** The scheduler's projection of a drawer row: what it needs and nothing rendering needs. */
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
 * The block length a drop, a Find Time candidate or the manual dialog creates.
 *
 * One function for every route, so the pointer path and the keyboard paths
 * cannot disagree about how long the block is (specs/03-weekly-calendar.md:
 * `estimated_minutes` determines the initial block length; `dnd.ts` fixes the
 * fallback when there is no estimate). Never shorter than a block can be: a
 * five-minute estimate is a real estimate, but the grid's smallest block is
 * `MIN_BLOCK_MINUTES`, and a drop that created a shorter one would make a
 * block the editor and a resize both refuse.
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
 * The sections as the user sees them right now.
 *
 * UNSCHEDULED is "owns no work block anywhere", decided on the server. The
 * moment a row is dropped onto the week the optimistic overlay holds a block
 * for it, so the row leaves the list here, in the same frame, and the server
 * agrees on refresh; if the write fails the block rolls back and the row
 * returns. OVERDUE and DUE THIS WEEK are unaffected — a block does not change
 * a deadline (Domain Rule 1) — and show their coverage instead.
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
 * Every task competing for the range, once each, for capacity and conflict
 * maths. Built from the server's sections rather than the live ones on
 * purpose: a task that just left UNSCHEDULED with a 45-minute block still has
 * the rest of its estimate outstanding, and UNSCHEDULED WORK has to keep
 * counting it.
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

/** The settings every planning question resolves against, from the profile's read. */
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
