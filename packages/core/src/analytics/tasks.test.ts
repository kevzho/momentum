import { describe, expect, it } from "vitest";

import { analyticsPeriod } from "./period";
import { tasksCompletedByDay, tasksCompletedByHour, totalTasksCompleted } from "./tasks";
import { d, KOLKATA, NEW_YORK, task } from "./test-fixtures";

const period = analyticsPeriod("7", d("2026-06-17"), NEW_YORK);

describe("tasksCompletedByDay", () => {
  it("counts completions on the local day they happened", () => {
    const series = tasksCompletedByDay(
      [
        task({ date: "2026-06-15", hour: 9 }),
        task({ date: "2026-06-15", hour: 17 }),
        task({ date: "2026-06-17", hour: 8 }),
      ],
      period,
      NEW_YORK,
    );

    expect(series.find((point) => point.date === "2026-06-15")?.value).toBe(2);
    expect(series.find((point) => point.date === "2026-06-16")?.value).toBe(0);
    expect(series.find((point) => point.date === "2026-06-17")?.value).toBe(1);
  });

  it("keeps a 23:40 completion on the day it was finished", () => {
    const series = tasksCompletedByDay(
      [task({ date: "2026-06-16", hour: 23, minute: 40 })],
      period,
      NEW_YORK,
    );

    expect(series.find((point) => point.date === "2026-06-16")?.value).toBe(1);
    expect(series.find((point) => point.date === "2026-06-17")?.value).toBe(0);
  });

  it("skips a row with no completion timestamp", () => {
    const orphan = { ...task({ date: "2026-06-15", hour: 9 }), completedAt: null };
    const series = tasksCompletedByDay([orphan], period, NEW_YORK);

    expect(series.every((point) => point.value === 0)).toBe(true);
  });

  it("zero-fills the whole period", () => {
    expect(tasksCompletedByDay([], period, NEW_YORK)).toHaveLength(7);
  });
});

describe("tasksCompletedByHour", () => {
  it("has 24 buckets and counts into the local hour", () => {
    const series = tasksCompletedByHour(
      [
        task({ date: "2026-06-15", hour: 16, minute: 5 }),
        task({ date: "2026-06-16", hour: 16, minute: 50 }),
        task({ date: "2026-06-16", hour: 9 }),
      ],
      period,
      NEW_YORK,
    );

    expect(series).toHaveLength(24);
    expect(series[16]?.value).toBe(2);
    expect(series[9]?.value).toBe(1);
    expect(series[10]?.value).toBe(0);
  });

  /**
   * The distribution is a statement about the user's day, so the same rows read
   * from another timezone must land in different hours. If this ever agreed, it
   * would mean the hour was being read off the UTC clock.
   */
  it("moves with the profile timezone", () => {
    const rows = [task({ date: "2026-06-15", hour: 9, tz: NEW_YORK })];

    expect(tasksCompletedByHour(rows, period, NEW_YORK)[9]?.value).toBe(1);
    // 09:00 in New York is 18:30 in Kolkata.
    expect(tasksCompletedByHour(rows, period, KOLKATA)[18]?.value).toBe(1);
  });
});

describe("totalTasksCompleted", () => {
  it("counts only what falls inside the period", () => {
    const total = totalTasksCompleted(
      [task({ date: "2026-06-15", hour: 9 }), task({ date: "2026-06-01", hour: 9 })],
      period,
      NEW_YORK,
    );

    expect(total).toBe(1);
  });
});
