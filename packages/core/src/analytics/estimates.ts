import type { IanaTimeZone, Minutes, Uuid } from "../types/scalars";
import type { CompletedTaskFact } from "./facts";
import { completedIn } from "./tasks";
import type { AnalyticsPeriod } from "./period";

/**
 * Planned time against actual time (Domain Rule 3). A task contributes to both
 * sides or to neither; a missing value is never replaced by the other; excluded
 * tasks are counted in `withoutEstimate`, not hidden.
 */

export interface EstimateComparison {
  /** Null is "no project" — a real bucket. */
  projectId: Uuid | null;
  /** Sum of `estimatedMinutes`. */
  plannedMinutes: Minutes;
  /** Sum of `actualMinutes` over those same tasks. */
  actualMinutes: Minutes;
  /** How many tasks are behind the pair. */
  taskCount: number;
}

/** The comparison across the whole period, plus what it does not cover. */
export interface EstimateTotals {
  plannedMinutes: Minutes;
  actualMinutes: Minutes;
  /** Tasks with both an estimate and measured minutes. */
  taskCount: number;
  /** Completed tasks excluded because they carried no estimate or recorded no time. */
  withoutEstimate: number;
}

/** A task is comparable only with both values present; a zero estimate is absent (it would divide to infinity). */
export function isComparable(task: CompletedTaskFact): boolean {
  return task.estimatedMinutes !== null && task.estimatedMinutes > 0 && task.actualMinutes > 0;
}

/** Chart 3: planned against actual, grouped by project, largest planned first. */
export function estimateComparisonByProject(
  tasks: readonly CompletedTaskFact[],
  period: AnalyticsPeriod,
  timezone: IanaTimeZone,
): EstimateComparison[] {
  const totals = new Map<string, EstimateComparison>();

  for (const task of completedIn(tasks, period, timezone)) {
    if (!isComparable(task)) continue;

    const key = task.projectId ?? "";
    const bucket = totals.get(key) ?? {
      projectId: task.projectId,
      plannedMinutes: 0,
      actualMinutes: 0,
      taskCount: 0,
    };

    // Both sides move together or not at all.
    bucket.plannedMinutes += task.estimatedMinutes ?? 0;
    bucket.actualMinutes += task.actualMinutes;
    bucket.taskCount += 1;
    totals.set(key, bucket);
  }

  return [...totals.values()].sort(
    (a, b) =>
      b.plannedMinutes - a.plannedMinutes || (a.projectId ?? "").localeCompare(b.projectId ?? ""),
  );
}

/** The same comparison over the whole period, with the uncovered tasks counted. */
export function estimateTotals(
  tasks: readonly CompletedTaskFact[],
  period: AnalyticsPeriod,
  timezone: IanaTimeZone,
): EstimateTotals {
  const inPeriod = completedIn(tasks, period, timezone);
  const comparable = inPeriod.filter(isComparable);

  return {
    plannedMinutes: comparable.reduce((total, task) => total + (task.estimatedMinutes ?? 0), 0),
    actualMinutes: comparable.reduce((total, task) => total + task.actualMinutes, 0),
    taskCount: comparable.length,
    withoutEstimate: inPeriod.length - comparable.length,
  };
}

/**
 * How far actual ran from planned, as a signed ratio: `+0.24` is 24% more time
 * than estimated. Null when there is no planned time; "no data" is not "0% off".
 */
export function estimateDeviation(row: {
  plannedMinutes: Minutes;
  actualMinutes: Minutes;
}): number | null {
  if (row.plannedMinutes <= 0) return null;
  return (row.actualMinutes - row.plannedMinutes) / row.plannedMinutes;
}
