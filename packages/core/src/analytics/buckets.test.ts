import { describe, expect, it } from "vitest";

import { addMinutes } from "../time";
import type { LocalDate } from "../types/scalars";
import {
  dayBucket,
  daySeries,
  hourBucket,
  hourSeries,
  sumInto,
  weekBucket,
  weeksOfPeriod,
} from "./buckets";
import { analyticsPeriod } from "./period";
import { at, d, FALL_BACK, KOLKATA, NEW_YORK, SPRING_FORWARD } from "./test-fixtures";

describe("dayBucket", () => {
  it("puts a late-evening instant on the day the user is living, not the UTC date", () => {
    // 23:30 in New York is already the next day in UTC.
    expect(dayBucket(at("2026-06-17", 23, 30), NEW_YORK)).toBe("2026-06-17");
    expect(dayBucket(at("2026-06-18", 0, 30), NEW_YORK)).toBe("2026-06-18");
  });

  it("answers in the user's zone rather than a shared one", () => {
    const midnightInNewYork = at("2026-06-17", 0, 0, NEW_YORK);

    expect(dayBucket(midnightInNewYork, NEW_YORK)).toBe("2026-06-17");
    // Mid-morning of the 17th in Kolkata: the same date by coincidence of offset.
    expect(dayBucket(midnightInNewYork, KOLKATA)).toBe("2026-06-17");
    // Late evening in New York is already the next morning in Kolkata.
    expect(dayBucket(at("2026-06-17", 20, 0, NEW_YORK), KOLKATA)).toBe("2026-06-18");
  });
});

describe("hourBucket", () => {
  it("reads the clock, hour by hour", () => {
    expect(hourBucket(at("2026-06-17", 0, 0), NEW_YORK)).toBe(0);
    expect(hourBucket(at("2026-06-17", 9, 59), NEW_YORK)).toBe(9);
    expect(hourBucket(at("2026-06-17", 23, 59), NEW_YORK)).toBe(23);
  });

  it("produces no hour the clock skipped on a spring-forward day", () => {
    const start = at("2026-03-08", 0, 0, NEW_YORK);
    const hours = new Set<number>();
    for (let step = 0; step < 23 * 6; step += 1) {
      hours.add(hourBucket(addMinutes(start, step * 10), NEW_YORK));
    }

    expect(hours.has(1)).toBe(true);
    expect(hours.has(2)).toBe(false);
    expect(hours.has(3)).toBe(true);
  });

  it("gives the repeated hour both of its passes on a fall-back day", () => {
    const firstOneAm = at("2026-11-01", 1, 0, NEW_YORK);
    const secondOneAm = addMinutes(firstOneAm, 60);

    expect(hourBucket(firstOneAm, NEW_YORK)).toBe(1);
    expect(hourBucket(secondOneAm, NEW_YORK)).toBe(1);
    expect(firstOneAm).not.toBe(secondOneAm);
  });
});

describe("weekBucket", () => {
  // 2026-06-17 is a Wednesday.
  it("buckets to the start of the user's own week", () => {
    const wednesday = at("2026-06-17", 12, 0);

    expect(weekBucket(wednesday, NEW_YORK, 1)).toBe("2026-06-15");
    expect(weekBucket(wednesday, NEW_YORK, 0)).toBe("2026-06-14");
  });

  it("keeps a late Sunday evening in the week that is ending", () => {
    const sundayNight = at("2026-06-21", 23, 40);

    expect(weekBucket(sundayNight, NEW_YORK, 1)).toBe("2026-06-15");
    expect(weekBucket(at("2026-06-22", 0, 20), NEW_YORK, 1)).toBe("2026-06-22");
  });

  it("does not drift across a DST weekend", () => {
    // 2026-03-08 is the Sunday the clocks move; its Monday week began the 2nd.
    expect(weekBucket(at("2026-03-08", 3, 30), NEW_YORK, 1)).toBe("2026-03-02");
    expect(weekBucket(at("2026-11-01", 1, 30), NEW_YORK, 1)).toBe("2026-10-26");
  });
});

describe("sumInto", () => {
  const keys: readonly string[] = ["a", "b", "c"];

  it("seeds every key at zero and keeps the empty ones", () => {
    const totals = sumInto(
      keys,
      [{ k: "b", n: 3 }],
      (item) => item.k,
      (item) => item.n,
    );

    expect([...totals.entries()]).toEqual([
      ["a", 0],
      ["b", 3],
      ["c", 0],
    ]);
  });

  it("ignores an item whose key is outside the axis rather than appending it", () => {
    const totals = sumInto(
      keys,
      [
        { k: "z", n: 99 },
        { k: "a", n: 1 },
      ],
      (item) => item.k,
      (item) => item.n,
    );

    expect(totals.get("a")).toBe(1);
    expect(totals.has("z")).toBe(false);
    expect(totals.size).toBe(3);
  });

  it("skips an item with no key at all", () => {
    const totals = sumInto(
      keys,
      [{ k: null, n: 5 }],
      (item) => item.k,
      (item) => item.n,
    );
    expect([...totals.values()]).toEqual([0, 0, 0]);
  });
});

describe("daySeries", () => {
  it("returns one entry per day of the period, in order, zero-filled", () => {
    const period = analyticsPeriod("7", d("2026-06-17"), NEW_YORK);
    const rows = [
      { date: d("2026-06-15"), n: 30 },
      { date: d("2026-06-15"), n: 15 },
    ];

    const series = daySeries(
      period.days,
      rows,
      (row) => row.date,
      (row) => row.n,
    );

    expect(series).toHaveLength(7);
    expect(series.map((point) => point.date)).toEqual(period.days);
    expect(series.find((point) => point.date === "2026-06-15")?.value).toBe(45);
    expect(series.find((point) => point.date === "2026-06-16")?.value).toBe(0);
  });

  it("drops a row outside the period instead of stretching the axis", () => {
    const period = analyticsPeriod("7", d("2026-06-17"), NEW_YORK);
    const outside: { date: LocalDate; n: number }[] = [{ date: d("2026-01-01"), n: 60 }];

    const series = daySeries(
      period.days,
      outside,
      (row) => row.date,
      (row) => row.n,
    );

    expect(series).toHaveLength(7);
    expect(series.every((point) => point.value === 0)).toBe(true);
  });
});

describe("hourSeries", () => {
  it("always has 24 buckets, including the quiet ones", () => {
    const series = hourSeries(
      [{ hour: 9 }],
      (row) => row.hour,
      () => 1,
    );

    expect(series).toHaveLength(24);
    expect(series[9]?.value).toBe(1);
    expect(series[10]?.value).toBe(0);
    expect(series.map((point) => point.hour)).toEqual([...Array(24).keys()]);
  });
});

describe("the transition dates the suite is built on", () => {
  it("are the days the New York clock actually moves", () => {
    expect(SPRING_FORWARD).toBe("2026-03-08");
    expect(FALL_BACK).toBe("2026-11-01");
  });
});

describe("weeksOfPeriod", () => {
  it("groups a period into columns starting on the user's week start", () => {
    const period = analyticsPeriod("7", d("2026-06-17"), NEW_YORK);
    const weeks = weeksOfPeriod(period.days, 1);

    // 2026-06-11 is a Thursday.
    expect(weeks.map((week) => week.start)).toEqual(["2026-06-08", "2026-06-15"]);
  });

  it("leaves the days outside the period absent rather than empty", () => {
    const period = analyticsPeriod("7", d("2026-06-17"), NEW_YORK);
    const weeks = weeksOfPeriod(period.days, 1);

    // Mon–Wed of the first week are before the period began.
    expect(weeks[0]?.days).toEqual([
      null,
      null,
      null,
      "2026-06-11",
      "2026-06-12",
      "2026-06-13",
      "2026-06-14",
    ]);
    expect(weeks[1]?.days.slice(3)).toEqual([null, null, null, null]);
  });

  it("follows a Sunday week start", () => {
    const period = analyticsPeriod("7", d("2026-06-17"), NEW_YORK);

    expect(weeksOfPeriod(period.days, 0).map((week) => week.start)).toEqual([
      "2026-06-07",
      "2026-06-14",
    ]);
  });

  it("always gives every week exactly seven slots", () => {
    const period = analyticsPeriod("90", d("2026-06-17"), NEW_YORK);
    const weeks = weeksOfPeriod(period.days, 1);

    expect(weeks.every((week) => week.days.length === 7)).toBe(true);
    const placed = weeks.flatMap((week) => week.days).filter((day) => day !== null);
    expect(placed).toEqual([...period.days]);
  });

  it("does not shift a column across a DST weekend", () => {
    const period = analyticsPeriod("30", d("2026-03-20"), NEW_YORK);
    const weeks = weeksOfPeriod(period.days, 1);

    // 2026-03-08 is the Sunday the clocks move: the last slot of the week of the 2nd.
    const springWeek = weeks.find((week) => week.start === "2026-03-02");
    expect(springWeek?.days.at(6)).toBe("2026-03-08");
  });

  it("returns nothing for an empty list of days", () => {
    expect(weeksOfPeriod([], 1)).toEqual([]);
  });
});
