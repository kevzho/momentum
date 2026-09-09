import { describe, expect, it } from "vitest";

import { blocksByStartHour, blocksIn, blockTotals } from "./blocks";
import { analyticsPeriod } from "./period";
import { block, d, FALL_BACK, NEW_YORK } from "./test-fixtures";

const period = analyticsPeriod("30", d("2026-11-10"), NEW_YORK);

describe("blockTotals", () => {
  it("separates what was scheduled from what was executed", () => {
    const totals = blockTotals(
      [
        block({ date: "2026-11-05", hour: 9, minutes: 60, done: true }),
        block({ date: "2026-11-05", hour: 14, minutes: 30 }),
        block({ date: "2026-11-06", hour: 9, minutes: 90, done: true }),
      ],
      period,
      NEW_YORK,
    );

    expect(totals).toEqual({
      scheduled: 3,
      completed: 2,
      scheduledMinutes: 180,
      completedMinutes: 150,
    });
  });

  /**
   * Elapsed minutes, not the clock face. A block drawn 01:00–02:00 on the
   * fall-back morning occupies two real hours of the user's day, and capacity
   * maths that believed the label would be an hour short.
   */
  it("counts the minutes a block really consumed across a fall-back hour", () => {
    const totals = blockTotals(
      [block({ date: "2026-11-01", hour: 1, minutes: 60 })],
      period,
      NEW_YORK,
    );

    expect(totals.scheduledMinutes).toBe(120);
  });

  it("counts a block on the local date it starts", () => {
    const totals = blockTotals(
      [block({ date: "2026-11-05", hour: 23, minutes: 60 })],
      period,
      NEW_YORK,
    );

    expect(totals.scheduled).toBe(1);
  });

  it("ignores blocks outside the period", () => {
    expect(blocksIn([block({ date: "2026-01-01", hour: 9 })], period, NEW_YORK)).toEqual([]);
  });
});

describe("blocksByStartHour", () => {
  it("splits on the wall-clock hour the block was scheduled to start", () => {
    const split = blocksByStartHour(
      [
        block({ date: "2026-11-05", hour: 9, done: true }),
        block({ date: "2026-11-05", hour: 15, done: true }),
        block({ date: "2026-11-05", hour: 16 }),
        block({ date: "2026-11-05", hour: 19, done: true }),
      ],
      period,
      NEW_YORK,
      16,
    );

    expect(split.before).toEqual({ scheduled: 2, completed: 2 });
    expect(split.after).toEqual({ scheduled: 2, completed: 1 });
  });

  it("puts a block starting exactly at the cutoff on the later side", () => {
    const split = blocksByStartHour(
      [block({ date: "2026-11-05", hour: 16 })],
      period,
      NEW_YORK,
      16,
    );

    expect(split.before.scheduled).toBe(0);
    expect(split.after.scheduled).toBe(1);
  });
});

describe("the fall-back fixture", () => {
  it("is the date this suite's 25-hour day falls on", () => {
    expect(FALL_BACK).toBe("2026-11-01");
  });
});
