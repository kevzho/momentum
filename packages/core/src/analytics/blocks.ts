import { durationMinutes, localDateOf } from "../time";
import type { IanaTimeZone, Minutes } from "../types/scalars";
import { hourBucket } from "./buckets";
import type { WorkBlockFact } from "./facts";
import { periodContains, type AnalyticsPeriod } from "./period";

/**
 * Scheduled work against executed work.
 *
 * A block is counted on the local date it *starts*, the same column the
 * calendar draws it in (Domain Rule 4). Its minutes are elapsed minutes, from
 * `durationMinutes` — so a block drawn across a fall-back hour contributes the
 * 120 minutes it really consumed rather than the 60 the clock face suggests.
 *
 * "Completed" means the span was executed, which is what `completed_at` on the
 * block records; it does not mean the task finished (Domain Rule 13).
 */

export interface BlockTotals {
  /** Blocks whose start falls inside the period. */
  scheduled: number;
  /** How many of those were marked done. */
  completed: number;
  scheduledMinutes: Minutes;
  completedMinutes: Minutes;
}

/** Completion counts either side of a wall-clock cutoff, for the time-of-day insight. */
export interface BlockSplit {
  /** Blocks starting strictly before the cutoff hour. */
  before: { scheduled: number; completed: number };
  /** Blocks starting at or after it. */
  after: { scheduled: number; completed: number };
}

export function blocksIn(
  blocks: readonly WorkBlockFact[],
  period: AnalyticsPeriod,
  timezone: IanaTimeZone,
): WorkBlockFact[] {
  return blocks.filter((block) => periodContains(period, localDateOf(block.startAt, timezone)));
}

export function blockTotals(
  blocks: readonly WorkBlockFact[],
  period: AnalyticsPeriod,
  timezone: IanaTimeZone,
): BlockTotals {
  const totals: BlockTotals = {
    scheduled: 0,
    completed: 0,
    scheduledMinutes: 0,
    completedMinutes: 0,
  };

  for (const block of blocksIn(blocks, period, timezone)) {
    const minutes = durationMinutes(block.startAt, block.endAt);
    totals.scheduled += 1;
    totals.scheduledMinutes += minutes;
    if (block.completedAt !== null) {
      totals.completed += 1;
      totals.completedMinutes += minutes;
    }
  }

  return totals;
}

/**
 * The period's blocks split by the hour they were scheduled to start.
 *
 * The cutoff is a parameter rather than a constant here because the insight
 * that uses it owns the choice, and because a split whose boundary is buried in
 * an aggregation cannot be tested against a different one.
 */
export function blocksByStartHour(
  blocks: readonly WorkBlockFact[],
  period: AnalyticsPeriod,
  timezone: IanaTimeZone,
  cutoffHour: number,
): BlockSplit {
  const split: BlockSplit = {
    before: { scheduled: 0, completed: 0 },
    after: { scheduled: 0, completed: 0 },
  };

  for (const block of blocksIn(blocks, period, timezone)) {
    const side = hourBucket(block.startAt, timezone) < cutoffHour ? split.before : split.after;
    side.scheduled += 1;
    if (block.completedAt !== null) side.completed += 1;
  }

  return split;
}
