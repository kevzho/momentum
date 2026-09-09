import type { IanaTimeZone, Minutes, Uuid } from "../types/scalars";
import type { CompletedTaskFact } from "./facts";
import { completedIn } from "./tasks";
import type { AnalyticsPeriod } from "./period";

/**
 * Planned time against actual time — the product's long-term differentiator,
 * and the one comparison in this module that is easy to get quietly wrong.
 *
 * **The two values are never mixed, and never stand in for one another**
 * (Domain Rule 3). Concretely, three rules, each of which has a test:
 *
 * 1. A task contributes to `plannedMinutes` and `actualMinutes` or to neither.
 *    Summing every estimate on one side and every measured minute on the other
 *    would compare two different sets of tasks and call the difference a
 *    calibration signal. A task with no estimate cannot be on the planned side,
 *    so it is on neither.
 * 2. A missing estimate is never replaced by the actual, and a missing actual is
 *    never replaced by the estimate. There is no fallback in this file.
 * 3. Tasks excluded by rule 1 are *counted*, not hidden. `withoutEstimate` is
 *    reported beside the comparison so the surface can say how much of the
 *    period the comparison does not cover, rather than implying it covers all
 *    of it.
 *
 * A task with an estimate but no measured minutes is excluded too: zero actual
 * against a real estimate is not evidence that the estimate was wrong, only
 * that the work was never timed.
 */

/** One project's planned and actual totals, over the same set of tasks. */
export interface EstimateComparison {
  /** Null is "no project" — a real bucket. */
  projectId: Uuid | null;
  /** Sum of `estimatedMinutes`. User intent. */
  plannedMinutes: Minutes;
  /** Sum of `actualMinutes` over *those same* tasks. Measured. */
  actualMinutes: Minutes;
  /** How many tasks are behind the pair. The sample size of any claim about it. */
  taskCount: number;
}

/** The comparison across the whole period, plus what it does not cover. */
export interface EstimateTotals {
  plannedMinutes: Minutes;
  actualMinutes: Minutes;
  /** Tasks with both an estimate and measured minutes. */
  taskCount: number;
  /**
   * Completed tasks the comparison excludes, because they carried no estimate
   * or recorded no time. Reported so the number above is not read as the whole
   * period.
   */
  withoutEstimate: number;
}

/**
 * A task may be compared only when it carries both values as facts.
 *
 * A zero or negative estimate is treated as absent: it is a placeholder, not a
 * prediction, and dividing by it later would produce an infinite deviation.
 */
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

    // Both sides move together or not at all. This is rule 1, written once.
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
 * than estimated, `-0.1` is 10% less.
 *
 * Null when there is no planned time to compare against — "no data" is not
 * "0% off", and a surface that printed 0% there would be inventing a
 * calibration the user never demonstrated.
 */
export function estimateDeviation(row: {
  plannedMinutes: Minutes;
  actualMinutes: Minutes;
}): number | null {
  if (row.plannedMinutes <= 0) return null;
  return (row.actualMinutes - row.plannedMinutes) / row.plannedMinutes;
}
