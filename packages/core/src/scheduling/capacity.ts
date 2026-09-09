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
 * Capacity: the three lines of the planning drawer and the bar under each day
 * (specs/05-week-planning.md; docs/SCHEDULING.md "Capacity and conflicts").
 *
 *   PLANNED            what the user has committed — every block that occupies
 *                      time, summed block by block, clipped to each day
 *   AVAILABLE          working time no commitment covers, today and after
 *   UNSCHEDULED WORK   estimate no work block covers yet, over the tasks given
 *
 * Two different sums run through this file, and the difference is the point.
 * Planned time is **summed without merging**: two blocks at 10:00 are two
 * claims on the same hour, and the number the drawer prints is what the user
 * has committed to, not how much of the day those commitments happen to
 * cover. Available time is **merged before it is measured**: a minute cannot
 * be freed twice, so the busy list is coalesced (`busyIntervals`) before it is
 * subtracted from the working windows. Both are elapsed minutes (Domain
 * Rule 3): a block across a DST transition costs the week what the clock
 * actually ran, and a working window on such a day is an hour longer or
 * shorter than it reads.
 *
 * Nothing here reads a clock. "Today" is `context.today`, resolved by the
 * caller in the profile timezone (Domain Rule 4), and the week's available
 * minutes count today in full: the server renders this number, the client's
 * first paint has to match it (docs/ARCHITECTURE.md §10), and the "~" the
 * drawer prints before it is the acknowledgement that part of today has gone.
 * Which blocks count at all is decided in one place, `occupiesTime`
 * (Domain Rule 13); this file never re-derives that rule.
 */

export interface CapacityInput {
  context: PlanningContext;
  /** Every block on the range — the live, optimistic list when called from the client. */
  commitments: readonly Commitment[];
  /** The tasks competing for the range: the drawer's sections, deduplicated. */
  tasks: readonly PlanningTask[];
}

/**
 * Elapsed minutes reserved for a task: its work blocks in the range plus what
 * lies outside it (`scheduledOutsideMinutes`).
 *
 * Coverage is *planned* time, so every work block of the task counts,
 * executed or not, and `occupiesTime` is deliberately not consulted: a block
 * that was already worked is still time that was scheduled toward the
 * estimate. The in-range blocks are summed live from `commitments` so an
 * optimistic block counts exactly once while its write is in flight.
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

/**
 * Estimate minus scheduled, floored at zero. Zero for an unestimated task.
 *
 * The same floor `coverageOf` applies (`packages/core/src/tasks/coverage.ts`):
 * an unestimated task has no remainder because there is no denominator to
 * invent one from, and a task with more booked than estimated has nothing
 * left rather than a negative amount.
 */
export function remainingMinutesOf(
  task: PlanningTask,
  commitments: readonly Commitment[],
): Minutes {
  if (task.estimatedMinutes === null || task.estimatedMinutes <= 0) return 0;
  return Math.max(0, task.estimatedMinutes - scheduledMinutesOf(task, commitments));
}

/**
 * One day's load against its working window.
 *
 * `busy` is the merged busy list of the whole range, computed once by the
 * caller; a commitment from another day subtracts nothing from this day's
 * windows, so passing the whole list is correct and avoids re-merging it
 * seven times.
 */
function dayWorkload(
  date: LocalDate,
  context: PlanningContext,
  commitments: readonly Commitment[],
  busy: readonly InstantInterval[],
): DayWorkload {
  const bounds = dayBounds(date, context.timezone);

  // Clipped to the day and summed block by block: a block from 23:30 to 00:30
  // gives 30 minutes to each of two days, and two blocks in the same hour
  // give the hour twice.
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
