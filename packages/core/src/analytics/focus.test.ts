import { describe, expect, it } from "vitest";

import {
  focusMinutesByDay,
  focusMinutesByHour,
  focusMinutesByProject,
  focusMinutesByWeekday,
  totalFocusMinutes,
} from "./focus";
import { analyticsPeriod } from "./period";
import { d, NEW_YORK, session } from "./test-fixtures";

const period = analyticsPeriod("7", d("2026-06-17"), NEW_YORK);

describe("focusMinutesByDay", () => {
  it("sums measured minutes into the day the session started on", () => {
    const series = focusMinutesByDay(
      [
        session({ date: "2026-06-15", hour: 9, minutes: 25 }),
        session({ date: "2026-06-15", hour: 14, minutes: 50 }),
        session({ date: "2026-06-16", hour: 9, minutes: 25 }),
      ],
      period,
      NEW_YORK,
    );

    expect(series.find((point) => point.date === "2026-06-15")?.value).toBe(75);
    expect(series.find((point) => point.date === "2026-06-16")?.value).toBe(25);
  });

  it("counts a session begun at 23:40 on the day it began", () => {
    const series = focusMinutesByDay(
      [session({ date: "2026-06-16", hour: 23, minute: 40, minutes: 40 })],
      period,
      NEW_YORK,
    );

    expect(series.find((point) => point.date === "2026-06-16")?.value).toBe(40);
    expect(series.find((point) => point.date === "2026-06-17")?.value).toBe(0);
  });

  it("ignores a session that is still running", () => {
    const series = focusMinutesByDay(
      [
        session({ date: "2026-06-15", hour: 9, minutes: null }),
        session({ date: "2026-06-15", hour: 11, minutes: 20 }),
      ],
      period,
      NEW_YORK,
    );

    expect(series.find((point) => point.date === "2026-06-15")?.value).toBe(20);
  });

  it("ignores a session outside the period", () => {
    const series = focusMinutesByDay(
      [session({ date: "2026-05-01", hour: 9, minutes: 90 })],
      period,
      NEW_YORK,
    );

    expect(series.every((point) => point.value === 0)).toBe(true);
  });

  it("zero-fills every day of the period", () => {
    const series = focusMinutesByDay([], period, NEW_YORK);

    expect(series).toHaveLength(7);
    expect(series.map((point) => point.date)).toEqual(period.days);
  });
});

describe("focusMinutesByProject", () => {
  it("orders by minutes and keeps 'no project' as a real bucket", () => {
    const rows = focusMinutesByProject(
      [
        session({ date: "2026-06-15", hour: 9, minutes: 30, projectId: "p1" }),
        session({ date: "2026-06-15", hour: 11, minutes: 90, projectId: "p2" }),
        session({ date: "2026-06-16", hour: 9, minutes: 45, projectId: null }),
      ],
      period,
      NEW_YORK,
    );

    expect(rows.map((row) => [row.projectId, row.minutes])).toEqual([
      ["p2", 90],
      [null, 45],
      ["p1", 30],
    ]);
    expect(rows[0]?.sessions).toBe(1);
  });

  it("breaks ties on the id so the order does not move between renders", () => {
    const rows = focusMinutesByProject(
      [
        session({ date: "2026-06-15", hour: 9, minutes: 30, projectId: "b" }),
        session({ date: "2026-06-15", hour: 11, minutes: 30, projectId: "a" }),
      ],
      period,
      NEW_YORK,
    );

    expect(rows.map((row) => row.projectId)).toEqual(["a", "b"]);
  });
});

describe("focusMinutesByHour", () => {
  it("buckets by the hour the local clock read", () => {
    const series = focusMinutesByHour(
      [
        session({ date: "2026-06-15", hour: 9, minute: 15, minutes: 25 }),
        session({ date: "2026-06-16", hour: 9, minute: 45, minutes: 25 }),
      ],
      period,
      NEW_YORK,
    );

    expect(series[9]?.value).toBe(50);
    expect(series).toHaveLength(24);
  });
});

describe("focusMinutesByWeekday", () => {
  it("carries the session count beside the minutes", () => {
    // 2026-06-15 is a Monday, 2026-06-16 a Tuesday.
    const rows = focusMinutesByWeekday(
      [
        session({ date: "2026-06-15", hour: 9, minutes: 30 }),
        session({ date: "2026-06-15", hour: 14, minutes: 30 }),
        session({ date: "2026-06-16", hour: 9, minutes: 10 }),
      ],
      period,
      NEW_YORK,
    );

    expect(rows).toHaveLength(7);
    expect(rows[1]).toEqual({ weekday: 1, value: 60, count: 2 });
    expect(rows[2]).toEqual({ weekday: 2, value: 10, count: 1 });
    expect(rows[3]).toEqual({ weekday: 3, value: 0, count: 0 });
  });
});

describe("totalFocusMinutes", () => {
  it("counts every measured minute in the period and nothing else", () => {
    const total = totalFocusMinutes(
      [
        session({ date: "2026-06-15", hour: 9, minutes: 30 }),
        session({ date: "2026-06-15", hour: 11, minutes: null }),
        session({ date: "2026-01-01", hour: 9, minutes: 500 }),
      ],
      period,
      NEW_YORK,
    );

    expect(total).toBe(30);
  });
});
