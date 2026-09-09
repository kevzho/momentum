import { localDateOf } from "../time";
import type { IanaTimeZone, Instant } from "../types/scalars";
import {
  dayBucket,
  daySeries,
  hourBucket,
  hourSeries,
  type DayValue,
  type HourValue,
} from "./buckets";
import type { CompletedTaskFact } from "./facts";
import { periodContains, type AnalyticsPeriod } from "./period";

/**
 * When tasks were completed: one series over the period's days, one over the
 * hours of the local clock.
 *
 * Both read `completedAt`, which is a timestamp the database stamped, and both
 * resolve it in the user's timezone rather than the server's — a task finished
 * at 23:40 belongs to the day the user finished it (Domain Rule 4).
 */

/** Completed tasks inside the period, with a usable timestamp. */
export function completedIn(
  tasks: readonly CompletedTaskFact[],
  period: AnalyticsPeriod,
  timezone: IanaTimeZone,
): CompletedTaskFact[] {
  return tasks.filter((task) => {
    if (task.completedAt === null) return false;
    return periodContains(period, localDateOf(task.completedAt, timezone));
  });
}

/** Chart 5: the completion trend, zero-filled across the whole period. */
export function tasksCompletedByDay(
  tasks: readonly CompletedTaskFact[],
  period: AnalyticsPeriod,
  timezone: IanaTimeZone,
): DayValue[] {
  return daySeries(
    period.days,
    completedIn(tasks, period, timezone),
    (task) => (task.completedAt === null ? null : dayBucket(task.completedAt, timezone)),
    () => 1,
  );
}

/**
 * Chart 6: how completions fall across the hours of the local clock.
 *
 * Twenty-four buckets always, including the empty ones — an axis that showed
 * only the hours with data would make four scattered completions look like a
 * routine.
 */
export function tasksCompletedByHour(
  tasks: readonly CompletedTaskFact[],
  period: AnalyticsPeriod,
  timezone: IanaTimeZone,
): HourValue[] {
  return hourSeries(
    completedIn(tasks, period, timezone),
    (task) => (task.completedAt === null ? null : hourBucket(task.completedAt, timezone)),
    () => 1,
  );
}

/** How many tasks were completed in the period. */
export function totalTasksCompleted(
  tasks: readonly CompletedTaskFact[],
  period: AnalyticsPeriod,
  timezone: IanaTimeZone,
): number {
  return completedIn(tasks, period, timezone).length;
}

/** The local hour of an instant, for callers that already hold one. */
export function localHourOf(at: Instant, timezone: IanaTimeZone): number {
  return hourBucket(at, timezone);
}
