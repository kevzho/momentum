import { formatDuration } from "../time/format";
import { durationMinutes } from "../time/duration";
import type { Instant, Minutes } from "../types/scalars";

/**
 * Coverage: how much of a task's estimate is actually on the calendar.
 *
 * This is the number that makes the planner useful (specs/04-task-manager.md).
 * A task due Friday with a 135-minute estimate and 45 minutes booked is not
 * "scheduled" — it is a third scheduled, and the other 90 minutes have to come
 * from somewhere in the same finite week.
 *
 * It is the arithmetic expression of Domain Rules 1 and 2 together: the
 * scheduled total is summed across ALL of the task's work blocks, on whatever
 * days they fall, and the due date is nowhere in this file. A model with one
 * `scheduled_start` per task could not produce this number at all — the sum
 * would always be one block or none — which is why the rule is a data-model
 * rule and not a UI preference.
 *
 * `estimatedMinutes` is the user's intent and is never replaced by actuals
 * (Domain Rule 3); nothing here reads `actual_minutes`.
 */

export type CoverageState =
  /** No estimate, so there is nothing to be a fraction of. */
  | "unestimated"
  /** Estimated, but no work block exists yet. */
  | "unscheduled"
  /** Some of the estimate is booked, and some is not. */
  | "partial"
  /** At least the estimate is booked. */
  | "covered"
  /** More is booked than was estimated. */
  | "over";

export interface Coverage {
  estimatedMinutes: Minutes | null;
  /** Summed over every work block the task owns, in every week. */
  scheduledMinutes: Minutes;
  /** Estimate minus scheduled, floored at zero. `0` when there is no estimate. */
  remainingMinutes: Minutes;
  /** Scheduled beyond the estimate, floored at zero. */
  overscheduledMinutes: Minutes;
  /** `scheduled / estimated`, uncapped; `null` when there is no estimate. */
  ratio: number | null;
  state: CoverageState;
}

/**
 * Minutes reserved by a set of work blocks.
 *
 * Elapsed time, via `durationMinutes` — not wall-clock difference — because a
 * block is a claim on the week and a DST day is 23 or 25 hours long
 * (Domain Rule 3). Blocks are summed whole: a task's coverage is not relative
 * to any displayed window.
 */
export function scheduledMinutesOf(
  blocks: readonly { startAt: Instant; endAt: Instant }[],
): Minutes {
  return blocks.reduce((total, block) => total + durationMinutes(block.startAt, block.endAt), 0);
}

export function coverageOf(estimatedMinutes: Minutes | null, scheduledMinutes: Minutes): Coverage {
  const scheduled = Math.max(0, Math.round(scheduledMinutes));

  if (estimatedMinutes === null || estimatedMinutes <= 0) {
    return {
      estimatedMinutes: null,
      scheduledMinutes: scheduled,
      remainingMinutes: 0,
      overscheduledMinutes: 0,
      ratio: null,
      // An unestimated task with blocks on the calendar is still unestimated:
      // the honest answer to "how much is left?" is that nobody has said.
      state: "unestimated",
    };
  }

  const estimated = Math.round(estimatedMinutes);
  const remaining = Math.max(0, estimated - scheduled);
  const over = Math.max(0, scheduled - estimated);

  return {
    estimatedMinutes: estimated,
    scheduledMinutes: scheduled,
    remainingMinutes: remaining,
    overscheduledMinutes: over,
    ratio: scheduled / estimated,
    state:
      scheduled === 0 ? "unscheduled" : over > 0 ? "over" : remaining === 0 ? "covered" : "partial",
  };
}

/**
 * `"45m of 2h 15m scheduled"` — the sentence the spec asks for, in one place so
 * the row, the sheet and the announcement cannot word it three ways.
 *
 * An unestimated task gets the only true statement available about it: what is
 * booked, with no denominator invented for it.
 */
export function formatCoverage(coverage: Coverage): string {
  if (coverage.estimatedMinutes === null) {
    return coverage.scheduledMinutes === 0
      ? "No estimate"
      : `${formatDuration(coverage.scheduledMinutes)} scheduled, no estimate`;
  }

  return `${formatDuration(coverage.scheduledMinutes)} of ${formatDuration(
    coverage.estimatedMinutes,
  )} scheduled`;
}

/** The short form for a dense row: `"45m / 2h 15m"`, or the estimate alone when nothing is booked. */
export function formatCoverageShort(coverage: Coverage): string | null {
  if (coverage.estimatedMinutes === null) {
    return coverage.scheduledMinutes === 0 ? null : formatDuration(coverage.scheduledMinutes);
  }
  if (coverage.scheduledMinutes === 0) return formatDuration(coverage.estimatedMinutes);
  return `${formatDuration(coverage.scheduledMinutes)} / ${formatDuration(coverage.estimatedMinutes)}`;
}
