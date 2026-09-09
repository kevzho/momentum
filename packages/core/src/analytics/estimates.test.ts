import { describe, expect, it } from "vitest";

import {
  estimateComparisonByProject,
  estimateDeviation,
  estimateTotals,
  isComparable,
} from "./estimates";
import { analyticsPeriod } from "./period";
import { d, NEW_YORK, task } from "./test-fixtures";

const period = analyticsPeriod("30", d("2026-06-17"), NEW_YORK);

describe("estimateComparisonByProject", () => {
  it("sums both sides over exactly the same tasks", () => {
    const rows = estimateComparisonByProject(
      [
        task({ date: "2026-06-15", hour: 9, estimated: 60, actual: 90, projectId: "p1" }),
        task({ date: "2026-06-16", hour: 9, estimated: 30, actual: 30, projectId: "p1" }),
      ],
      period,
      NEW_YORK,
    );

    expect(rows).toEqual([
      { projectId: "p1", plannedMinutes: 90, actualMinutes: 120, taskCount: 2 },
    ]);
  });

  it("excludes a task with no estimate from BOTH sides, never just the planned one", () => {
    const rows = estimateComparisonByProject(
      [
        task({ date: "2026-06-15", hour: 9, estimated: 60, actual: 60, projectId: "p1" }),
        // If this leaked into the actual side alone, the project would read as 300% over.
        task({ date: "2026-06-16", hour: 9, estimated: null, actual: 240, projectId: "p1" }),
      ],
      period,
      NEW_YORK,
    );

    expect(rows).toEqual([
      { projectId: "p1", plannedMinutes: 60, actualMinutes: 60, taskCount: 1 },
    ]);
  });

  it("excludes a task that recorded no time from both sides", () => {
    const rows = estimateComparisonByProject(
      [
        task({ date: "2026-06-15", hour: 9, estimated: 60, actual: 60, projectId: "p1" }),
        task({ date: "2026-06-16", hour: 9, estimated: 120, actual: 0, projectId: "p1" }),
      ],
      period,
      NEW_YORK,
    );

    expect(rows[0]?.plannedMinutes).toBe(60);
    expect(rows[0]?.actualMinutes).toBe(60);
    expect(rows[0]?.taskCount).toBe(1);
  });

  it("treats a zero estimate as absent rather than as a prediction of nothing", () => {
    const rows = estimateComparisonByProject(
      [task({ date: "2026-06-15", hour: 9, estimated: 0, actual: 45, projectId: "p1" })],
      period,
      NEW_YORK,
    );

    expect(rows).toEqual([]);
  });

  it("keeps projects apart and 'no project' as its own bucket", () => {
    const rows = estimateComparisonByProject(
      [
        task({ date: "2026-06-15", hour: 9, estimated: 30, actual: 30, projectId: "p1" }),
        task({ date: "2026-06-15", hour: 11, estimated: 90, actual: 60, projectId: "p2" }),
        task({ date: "2026-06-15", hour: 13, estimated: 60, actual: 60, projectId: null }),
      ],
      period,
      NEW_YORK,
    );

    expect(rows.map((row) => row.projectId)).toEqual(["p2", null, "p1"]);
  });

  it("ignores a task completed outside the period", () => {
    const rows = estimateComparisonByProject(
      [task({ date: "2026-01-01", hour: 9, estimated: 60, actual: 90, projectId: "p1" })],
      period,
      NEW_YORK,
    );

    expect(rows).toEqual([]);
  });
});

describe("estimateTotals", () => {
  it("counts the tasks the comparison cannot cover instead of hiding them", () => {
    const totals = estimateTotals(
      [
        task({ date: "2026-06-15", hour: 9, estimated: 60, actual: 90 }),
        task({ date: "2026-06-15", hour: 11, estimated: null, actual: 45 }),
        task({ date: "2026-06-15", hour: 13, estimated: 30, actual: 0 }),
      ],
      period,
      NEW_YORK,
    );

    expect(totals).toEqual({
      plannedMinutes: 60,
      actualMinutes: 90,
      taskCount: 1,
      withoutEstimate: 2,
    });
  });

  it("reports zeroes and no coverage for a period with nothing in it", () => {
    expect(estimateTotals([], period, NEW_YORK)).toEqual({
      plannedMinutes: 0,
      actualMinutes: 0,
      taskCount: 0,
      withoutEstimate: 0,
    });
  });
});

describe("estimateDeviation", () => {
  it("is signed: positive is more time than planned", () => {
    expect(estimateDeviation({ plannedMinutes: 100, actualMinutes: 124 })).toBeCloseTo(0.24);
    expect(estimateDeviation({ plannedMinutes: 100, actualMinutes: 90 })).toBeCloseTo(-0.1);
    expect(estimateDeviation({ plannedMinutes: 100, actualMinutes: 100 })).toBe(0);
  });

  it("is null rather than zero when there is nothing to compare against", () => {
    expect(estimateDeviation({ plannedMinutes: 0, actualMinutes: 50 })).toBeNull();
  });
});

describe("isComparable", () => {
  it("requires both values to be present facts", () => {
    expect(isComparable(task({ date: "2026-06-15", hour: 9, estimated: 60, actual: 60 }))).toBe(
      true,
    );
    expect(isComparable(task({ date: "2026-06-15", hour: 9, estimated: null, actual: 60 }))).toBe(
      false,
    );
    expect(isComparable(task({ date: "2026-06-15", hour: 9, estimated: 60, actual: 0 }))).toBe(
      false,
    );
  });
});
