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

/** Chart 6: completions per local hour. Always twenty-four buckets, including empty ones. */
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
