import { durationMinutes, localDateOf } from "../time";
import type { IanaTimeZone, Minutes } from "../types/scalars";
import { hourBucket } from "./buckets";
import type { WorkBlockFact } from "./facts";
import { periodContains, type AnalyticsPeriod } from "./period";

/**
 * A block is counted on the local date it starts; its minutes are elapsed
 * minutes, so a block across a fall-back hour contributes 120, not 60.
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

/** The period's blocks split by the local hour they were scheduled to start. */
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
