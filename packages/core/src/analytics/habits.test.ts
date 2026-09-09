import { describe, expect, it } from "vitest";

import { habitCompletionRate, habitConsistencyByDay } from "./habits";
import { analyticsPeriod } from "./period";
import { completion, d, dailyHabit, NEW_YORK, weeklyHabit } from "./test-fixtures";

const period = analyticsPeriod("7", d("2026-06-17"), NEW_YORK);

const dayOn = (
  days: ReturnType<typeof habitConsistencyByDay>,
  date: string,
): { expected: number; met: number; recorded: number } => {
  const found = days.find((day) => day.date === date);
  if (found === undefined) throw new Error(`no day ${date}`);
  return { expected: found.expected, met: found.met, recorded: found.recorded };
};

describe("habitConsistencyByDay", () => {
  it("expects one per day per daily habit and marks the ones that were met", () => {
    const days = habitConsistencyByDay(
      [dailyHabit("h1", "2026-06-01"), dailyHabit("h2", "2026-06-01")],
      [
        completion("h1", "2026-06-15"),
        completion("h2", "2026-06-15"),
        completion("h1", "2026-06-16"),
      ],
      period,
    );

    expect(dayOn(days, "2026-06-15")).toEqual({ expected: 2, met: 2, recorded: 2 });
    expect(dayOn(days, "2026-06-16")).toEqual({ expected: 2, met: 1, recorded: 1 });
    expect(dayOn(days, "2026-06-14")).toEqual({ expected: 2, met: 0, recorded: 0 });
  });

  it("expects nothing of a habit before it was tracked", () => {
    const days = habitConsistencyByDay([dailyHabit("h1", "2026-06-16")], [], period);

    expect(dayOn(days, "2026-06-15").expected).toBe(0);
    expect(dayOn(days, "2026-06-16").expected).toBe(1);
  });

  it("expects nothing of a habit from the day it was archived", () => {
    const days = habitConsistencyByDay([dailyHabit("h1", "2026-06-01", "2026-06-16")], [], period);

    expect(dayOn(days, "2026-06-15").expected).toBe(1);
    expect(dayOn(days, "2026-06-16").expected).toBe(0);
    expect(dayOn(days, "2026-06-17").expected).toBe(0);
  });

  it("records a per-week habit's completions without inventing a daily target", () => {
    const days = habitConsistencyByDay(
      [weeklyHabit("h1", "2026-06-01")],
      [completion("h1", "2026-06-15")],
      period,
    );

    expect(dayOn(days, "2026-06-15")).toEqual({ expected: 0, met: 0, recorded: 1 });
    expect(dayOn(days, "2026-06-16")).toEqual({ expected: 0, met: 0, recorded: 0 });
  });

  it("returns one entry per date of the period, in order", () => {
    const days = habitConsistencyByDay([], [], period);

    expect(days).toHaveLength(7);
    expect(days.map((day) => day.date)).toEqual(period.days);
  });
});

describe("habitCompletionRate", () => {
  it("is met over expected", () => {
    const days = habitConsistencyByDay(
      [dailyHabit("h1", "2026-06-01")],
      [
        completion("h1", "2026-06-11"),
        completion("h1", "2026-06-12"),
        completion("h1", "2026-06-13"),
      ],
      period,
    );

    // Six finished days, three met; today is unfinished and unmet, so it is out.
    expect(habitCompletionRate(days)).toEqual({ met: 3, expected: 6, value: 0.5 });
  });

  it("leaves the last day out of the denominator until it is met", () => {
    const habit = dailyHabit("h1", "2026-06-01");
    const met = [
      completion("h1", "2026-06-11"),
      completion("h1", "2026-06-12"),
      completion("h1", "2026-06-13"),
      completion("h1", "2026-06-14"),
      completion("h1", "2026-06-15"),
      completion("h1", "2026-06-16"),
    ];

    const withoutToday = habitCompletionRate(habitConsistencyByDay([habit], met, period));
    expect(withoutToday).toEqual({ met: 6, expected: 6, value: 1 });

    const withToday = habitCompletionRate(
      habitConsistencyByDay([habit], [...met, completion("h1", "2026-06-17")], period),
    );
    expect(withToday).toEqual({ met: 7, expected: 7, value: 1 });
  });

  it("reports null rather than 0% when nothing was expected", () => {
    expect(habitCompletionRate(habitConsistencyByDay([], [], period))).toEqual({
      met: 0,
      expected: 0,
      value: null,
    });
  });
});
