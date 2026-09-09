import { describe, expect, it } from "vitest";

import { addDays, instant, localDate } from "@momentum/core/time";
import type { Habit, LocalDate } from "@momentum/core/types";

import { buildHeatmap, heatmapDayLabels } from "@/features/habits/heatmap";

function habitOf(overrides: Partial<Habit> = {}): Habit {
  return {
    id: "habit-1",
    userId: "user-1",
    name: "Read 20 pages",
    description: null,
    frequencyType: "daily",
    target: 1,
    unit: "count",
    activeDays: [],
    preferredStartTime: null,
    estimatedMinutes: null,
    xpReward: 5,
    color: null,
    archivedAt: null,
    createdAt: instant("2026-08-01T00:00:00.000Z"),
    updatedAt: instant("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

const done = (dates: readonly string[], amount = 1) =>
  dates.map((date) => ({ completionDate: localDate(date), amount }));

describe("buildHeatmap", () => {
  it("lays the range out as whole weeks in the user's own week shape", () => {
    // 2026-09-07 is a Monday.
    const weeks = buildHeatmap({
      habit: habitOf(),
      completions: [],
      from: localDate("2026-09-07"),
      to: localDate("2026-09-20"),
      today: localDate("2026-09-20"),
      weekStart: 1,
      trackedFrom: localDate("2026-09-07"),
    });

    expect(weeks).toHaveLength(2);
    expect(weeks[0]?.key).toBe("2026-09-07");
    expect(weeks[1]?.key).toBe("2026-09-14");
    expect(weeks[0]?.days).toHaveLength(7);
  });

  it("pads a partial leading week with nulls rather than with claims about days", () => {
    // A Sunday-start week beginning 2026-09-06, asked for from the Tuesday.
    const weeks = buildHeatmap({
      habit: habitOf(),
      completions: [],
      from: localDate("2026-09-08"),
      to: localDate("2026-09-12"),
      today: localDate("2026-09-12"),
      weekStart: 0,
      trackedFrom: localDate("2026-09-08"),
    });

    // Sunday and Monday are outside the range: no cell, not an "open" cell.
    expect(weeks[0]?.days[0]).toBeNull();
    expect(weeks[0]?.days[1]).toBeNull();
    expect(weeks[0]?.days[2]).not.toBeNull();
  });

  it("carries the date and the state as text on every cell", () => {
    const weeks = buildHeatmap({
      habit: habitOf(),
      completions: done(["2026-09-07"]),
      from: localDate("2026-09-07"),
      to: localDate("2026-09-09"),
      today: localDate("2026-09-09"),
      weekStart: 1,
      trackedFrom: localDate("2026-09-07"),
    });

    expect(weeks[0]?.days[0]?.label).toBe("Monday, September 7, 2026: done");
    expect(weeks[0]?.days[1]?.label).toBe("Tuesday, September 8, 2026: not recorded");
    // Today is not over, so it reads as coming up rather than as anything worse.
    expect(weeks[0]?.days[2]?.label).toBe("Wednesday, September 9, 2026: coming up");
  });

  it("shows nothing at all before the habit existed", () => {
    const weeks = buildHeatmap({
      habit: habitOf(),
      completions: [],
      from: localDate("2026-09-07"),
      to: localDate("2026-09-11"),
      today: localDate("2026-09-11"),
      weekStart: 1,
      trackedFrom: localDate("2026-09-10"),
    });

    expect(weeks[0]?.days[0]).toBeNull();
    expect(weeks[0]?.days[2]).toBeNull();
    // 2026-09-10 is the first day it did exist for.
    expect(weeks[0]?.days[3]).not.toBeNull();
    expect(weeks[0]?.days[3]?.key).toBe("2026-09-10");
  });

  it("agrees with the week strip about the same day", () => {
    const habit = habitOf({ frequencyType: "weekdays", activeDays: [1, 3, 5] });
    const weeks = buildHeatmap({
      habit,
      completions: done(["2026-09-07"]),
      from: localDate("2026-09-07"),
      to: localDate("2026-09-11"),
      today: localDate("2026-09-11"),
      weekStart: 1,
      trackedFrom: localDate("2026-09-07"),
    });

    //          Mon    Tue     Wed     Thu     Fri
    expect(weeks[0]?.days.slice(0, 5).map((day) => day?.state)).toEqual([
      "met",
      "free",
      "open",
      "free",
      "ahead",
    ]);
  });

  it("counts a DST week as one column", () => {
    // 2026-03-08 is a US spring-forward Sunday in the Monday week of 2026-03-02.
    // Completion dates are calendar dates, so the 23-hour day is one day.
    const from = localDate("2026-03-02");
    const weeks = buildHeatmap({
      habit: habitOf(),
      completions: done(Array.from({ length: 7 }, (_, i) => addDays(from, i))),
      from,
      to: localDate("2026-03-08"),
      today: localDate("2026-03-09"),
      weekStart: 1,
      trackedFrom: from,
    });

    expect(weeks).toHaveLength(1);
    expect(weeks[0]?.days.every((day) => day?.state === "met")).toBe(true);
  });
});

describe("heatmapDayLabels", () => {
  it("labels the rows from the resolved week, so the rotation matches it", () => {
    const week: LocalDate[] = Array.from({ length: 7 }, (_, i) =>
      addDays(localDate("2026-09-07"), i),
    );
    expect(heatmapDayLabels(1, week)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });

  it("falls back to the preference's own rotation without a week", () => {
    expect(heatmapDayLabels(0, [])[0]).toBe("Sun");
    expect(heatmapDayLabels(1, [])[0]).toBe("Mon");
  });
});
