import { formatDuration } from "../time/format";
import { durationMinutes } from "../time/duration";
import type { Instant, Minutes } from "../types/scalars";

/** Coverage: how much of a task's estimate is on the calendar, summed across all its work blocks. Never reads actuals. */

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

/** Minutes reserved by a set of work blocks: elapsed time, so a DST day is 23 or 25 hours long. */
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
      // An unestimated task with blocks on the calendar is still unestimated.
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

/** `"45m of 2h 15m scheduled"`; an unestimated task states only what is booked. */
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
