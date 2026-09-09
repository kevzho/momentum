import { describe, expect, it } from "vitest";

import { instant } from "../time/scalars";
import type { Instant } from "../types/scalars";
import { coverageOf, formatCoverage, formatCoverageShort, scheduledMinutesOf } from "./coverage";

function block(startAt: string, endAt: string): { startAt: Instant; endAt: Instant } {
  return { startAt: instant(startAt), endAt: instant(endAt) };
}

// Essay due Friday, estimated 135m: Mon 45m · Tue 60m · Thu 30m.
const ESSAY_BLOCKS = [
  block("2026-09-07T16:00:00.000Z", "2026-09-07T16:45:00.000Z"), // Mon, 45m
  block("2026-09-08T17:00:00.000Z", "2026-09-08T18:00:00.000Z"), // Tue, 60m
  block("2026-09-10T19:00:00.000Z", "2026-09-10T19:30:00.000Z"), // Thu, 30m
];

describe("scheduledMinutesOf", () => {
  it("sums every block a task owns", () => {
    expect(scheduledMinutesOf(ESSAY_BLOCKS)).toBe(135);
  });

  it("is zero for a task with no blocks", () => {
    expect(scheduledMinutesOf([])).toBe(0);
  });

  it("sums elapsed time, so a DST day is not 24 hours of wall clock", () => {
    // 2026-11-01, America/New_York falls back: 01:00–02:00 local happens twice.
    expect(
      scheduledMinutesOf([block("2026-11-01T05:00:00.000Z", "2026-11-01T07:00:00.000Z")]),
    ).toBe(120);
  });
});

describe("coverageOf", () => {
  it("reports the essay as partially scheduled across its three blocks", () => {
    const coverage = coverageOf(135, scheduledMinutesOf(ESSAY_BLOCKS));

    expect(coverage).toEqual({
      estimatedMinutes: 135,
      scheduledMinutes: 135,
      remainingMinutes: 0,
      overscheduledMinutes: 0,
      ratio: 1,
      state: "covered",
    });
  });

  it("is the gap that makes the planner useful when only some is booked", () => {
    const coverage = coverageOf(135, scheduledMinutesOf(ESSAY_BLOCKS.slice(0, 1)));

    expect(coverage.scheduledMinutes).toBe(45);
    expect(coverage.remainingMinutes).toBe(90);
    expect(coverage.state).toBe("partial");
    expect(coverage.ratio).toBeCloseTo(45 / 135);
  });

  it("distinguishes estimated-but-unscheduled from unestimated", () => {
    expect(coverageOf(60, 0).state).toBe("unscheduled");
    expect(coverageOf(null, 0).state).toBe("unestimated");
  });

  it("never invents a denominator for an unestimated task, even when blocks exist", () => {
    const coverage = coverageOf(null, 90);

    expect(coverage.estimatedMinutes).toBeNull();
    expect(coverage.ratio).toBeNull();
    expect(coverage.remainingMinutes).toBe(0);
    expect(coverage.scheduledMinutes).toBe(90);
    expect(coverage.state).toBe("unestimated");
  });

  it("treats a non-positive estimate as no estimate rather than dividing by zero", () => {
    expect(coverageOf(0, 30).ratio).toBeNull();
    expect(coverageOf(0, 30).state).toBe("unestimated");
  });

  it("reports over-scheduling instead of clamping it away", () => {
    const coverage = coverageOf(60, 90);

    expect(coverage.overscheduledMinutes).toBe(30);
    expect(coverage.remainingMinutes).toBe(0);
    expect(coverage.ratio).toBeCloseTo(1.5);
    expect(coverage.state).toBe("over");
  });

  it("floors negative scheduled input rather than reporting a negative booking", () => {
    expect(coverageOf(60, -30).scheduledMinutes).toBe(0);
  });
});

describe("formatCoverage", () => {
  it("is the sentence the spec asks for", () => {
    expect(formatCoverage(coverageOf(135, 45))).toBe("45m of 2h 15m scheduled");
  });

  it("states only what is true of an unestimated task", () => {
    expect(formatCoverage(coverageOf(null, 0))).toBe("No estimate");
    expect(formatCoverage(coverageOf(null, 90))).toBe("1h 30m scheduled, no estimate");
  });

  it("keeps the short form to what fits a dense row", () => {
    expect(formatCoverageShort(coverageOf(135, 45))).toBe("45m / 2h 15m");
    expect(formatCoverageShort(coverageOf(135, 0))).toBe("2h 15m");
    expect(formatCoverageShort(coverageOf(null, 0))).toBeNull();
    expect(formatCoverageShort(coverageOf(null, 45))).toBe("45m");
  });
});
