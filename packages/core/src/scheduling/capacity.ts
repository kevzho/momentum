import { weekdayOf } from "../time";
import type { LocalDate, Minutes } from "../types";
import {
  busyIntervals,
  dayBounds,
  intersectIntervals,
  intervalMinutes,
  occupiesTime,
  subtractIntervals,
  totalMinutes,
  workingIntervalsOn,
} from "./intervals";
import type {
  Commitment,
  DayWorkload,
  InstantInterval,
  PlanningContext,
  PlanningTask,
  WeekCapacity,
} from "./types";

/**
 * Capacity (docs/SCHEDULING.md). Planned time is summed without merging: two
 * blocks at 10:00 are two claims on the hour. Available time is merged before
 * it is measured: a minute cannot be freed twice. Today's available minutes
 * count in full so the server render and the client's first paint agree.
 * Which blocks count is decided by `occupiesTime` alone.
 */

export interface CapacityInput {
  context: PlanningContext;
  /** Every block on the range — the live, optimistic list when called from the client. */
  commitments: readonly Commitment[];
  /** The tasks competing for the range: the drawer's sections, deduplicated. */
  tasks: readonly PlanningTask[];
}

/**
 * Elapsed minutes reserved for a task: its work blocks in the range plus
 * `scheduledOutsideMinutes`. `occupiesTime` is deliberately not consulted:
 * a block already worked is still time scheduled toward the estimate.
 */
export function scheduledMinutesOf(
  task: PlanningTask,
  commitments: readonly Commitment[],
): Minutes {
  let scheduled = Math.max(0, task.scheduledOutsideMinutes);
  for (const commitment of commitments) {
    if (commitment.kind === "work" && commitment.taskId === task.id) {
      scheduled += intervalMinutes(commitment);
    }
  }
  return scheduled;
}

/** Estimate minus scheduled, floored at zero; zero for an unestimated task. Same floor as `coverageOf`. */
export function remainingMinutesOf(
  task: PlanningTask,
  commitments: readonly Commitment[],
): Minutes {
  if (task.estimatedMinutes === null || task.estimatedMinutes <= 0) return 0;
  return Math.max(0, task.estimatedMinutes - scheduledMinutesOf(task, commitments));
}

/** One day's load against its working window. `busy` is the whole range's merged list, computed once by the caller. */
function dayWorkload(
  date: LocalDate,
  context: PlanningContext,
  commitments: readonly Commitment[],
  busy: readonly InstantInterval[],
): DayWorkload {
  const bounds = dayBounds(date, context.timezone);

  // Clipped to the day and summed block by block, without merging.
  let workMinutes = 0;
  let eventMinutes = 0;
  for (const commitment of commitments) {
    if (!occupiesTime(commitment)) continue;
    const part = intersectIntervals(commitment, bounds);
    if (part === null) continue;
    const minutes = intervalMinutes(part);
    if (commitment.kind === "event") eventMinutes += minutes;
    else workMinutes += minutes;
  }

  const working = workingIntervalsOn(date, context.workingHours, context.timezone);

  return {
    date,
    weekday: weekdayOf(date),
    plannedMinutes: workMinutes + eventMinutes,
    workMinutes,
    eventMinutes,
    workingMinutes: totalMinutes(working),
    availableMinutes: totalMinutes(subtractIntervals(working, busy)),
    isPast: date < context.today,
  };
}

/** Σ `remainingMinutesOf` over the tasks, each task counted once whatever the list repeats. */
function unscheduledMinutesOf(
  tasks: readonly PlanningTask[],
  commitments: readonly Commitment[],
): Minutes {
  const seen = new Set<string>();
  let unscheduled = 0;
  for (const task of tasks) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    unscheduled += remainingMinutesOf(task, commitments);
  }
  return unscheduled;
}

/**
 * The capacity display for the range: one `DayWorkload` per `context.days`
 * entry, in order, and the totals over them.
 *
 *   plannedMinutes     Σ day planned — past days included; it is the week
 *   workingMinutes     Σ day working — likewise the configured week
 *   availableMinutes   Σ day available over days that are not past
 *   unscheduledMinutes Σ remaining estimate over the tasks, deduplicated
 */
export function weekCapacity(input: CapacityInput): WeekCapacity {
  const busy = busyIntervals(input.commitments);
  const days = input.context.days.map((date) =>
    dayWorkload(date, input.context, input.commitments, busy),
  );

  let plannedMinutes = 0;
  let workingMinutes = 0;
  let availableMinutes = 0;
  for (const day of days) {
    plannedMinutes += day.plannedMinutes;
    workingMinutes += day.workingMinutes;
    if (!day.isPast) availableMinutes += day.availableMinutes;
  }

  return {
    plannedMinutes,
    availableMinutes,
    unscheduledMinutes: unscheduledMinutesOf(input.tasks, input.commitments),
    workingMinutes,
    days,
  };
}
