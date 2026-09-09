import { describe, expect, it } from "vitest";

import { addDays, diffDays, weekOf, weekdayOf } from "./calendar-date";
import { localDate } from "./scalars";

const d = localDate;

const SUNDAY = 0;
const MONDAY = 1;
const SATURDAY = 6;

describe("addDays", () => {
  it("crosses a month boundary", () => {
    expect(addDays(d("2026-09-30"), 1)).toBe("2026-10-01");
    expect(addDays(d("2026-10-01"), -1)).toBe("2026-09-30");
  });

  it("crosses a year boundary", () => {
    expect(addDays(d("2025-12-31"), 1)).toBe("2026-01-01");
    expect(addDays(d("2026-01-01"), -1)).toBe("2025-12-31");
  });

  it("crosses a leap day and skips it in a common year", () => {
    expect(addDays(d("2028-02-28"), 1)).toBe("2028-02-29");
    expect(addDays(d("2028-02-29"), 1)).toBe("2028-03-01");
    expect(addDays(d("2026-02-28"), 1)).toBe("2026-03-01");
  });

  it("is unaffected by a DST transition, because a local day is still one date later", () => {
    // 2026-03-08 is 23 hours long in America/New_York; the date after it is still 2026-03-09.
    expect(addDays(d("2026-03-08"), 1)).toBe("2026-03-09");
    expect(addDays(d("2026-11-01"), 1)).toBe("2026-11-02");
  });

  it("adds zero and large spans", () => {
    expect(addDays(d("2026-09-07"), 0)).toBe("2026-09-07");
    expect(addDays(d("2026-09-07"), 365)).toBe("2027-09-07");
    expect(addDays(d("2026-09-07"), -365)).toBe("2025-09-07");
  });
});

describe("diffDays", () => {
  it("counts whole days in both directions", () => {
    expect(diffDays(d("2026-09-07"), d("2026-09-13"))).toBe(6);
    expect(diffDays(d("2026-09-13"), d("2026-09-07"))).toBe(-6);
    expect(diffDays(d("2026-09-07"), d("2026-09-07"))).toBe(0);
  });

  it("is exact across month, year and leap boundaries", () => {
    expect(diffDays(d("2026-01-31"), d("2026-02-01"))).toBe(1);
    expect(diffDays(d("2025-12-31"), d("2026-01-01"))).toBe(1);
    expect(diffDays(d("2028-02-01"), d("2028-03-01"))).toBe(29);
    expect(diffDays(d("2026-02-01"), d("2026-03-01"))).toBe(28);
  });

  it("is the inverse of addDays", () => {
    for (const n of [-400, -31, -1, 0, 1, 45, 400]) {
      expect(diffDays(d("2026-09-07"), addDays(d("2026-09-07"), n))).toBe(n);
    }
  });
});

describe("weekdayOf", () => {
  it("uses the Sunday-zero convention", () => {
    expect(weekdayOf(d("2026-09-06"))).toBe(SUNDAY);
    expect(weekdayOf(d("2026-09-07"))).toBe(MONDAY);
    expect(weekdayOf(d("2026-09-12"))).toBe(SATURDAY);
  });
});

describe("weekOf", () => {
  it("starts a Monday week on the Monday", () => {
    const week = weekOf(d("2026-09-09"), MONDAY);
    expect(week.start).toBe("2026-09-07");
    expect(week.days).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
    ]);
  });

  it("starts a Sunday week on the Sunday, for the same date", () => {
    const week = weekOf(d("2026-09-09"), SUNDAY);
    expect(week.start).toBe("2026-09-06");
    expect(week.days.at(-1)).toBe("2026-09-12");
  });

  it("treats the week start day itself as the first day, not the previous week", () => {
    expect(weekOf(d("2026-09-07"), MONDAY).start).toBe("2026-09-07");
    expect(weekOf(d("2026-09-06"), SUNDAY).start).toBe("2026-09-06");
  });

  it("treats the day before the week start as the last day of the previous week", () => {
    expect(weekOf(d("2026-09-06"), MONDAY).start).toBe("2026-08-31");
    expect(weekOf(d("2026-09-05"), SUNDAY).start).toBe("2026-08-30");
  });

  it("spans a month boundary", () => {
    const week = weekOf(d("2026-10-01"), MONDAY);
    expect(week.days).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
  });

  it("spans a year boundary", () => {
    const week = weekOf(d("2026-01-01"), MONDAY);
    expect(week.start).toBe("2025-12-29");
    expect(week.days).toEqual([
      "2025-12-29",
      "2025-12-30",
      "2025-12-31",
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
    ]);
  });

  it("spans a leap day", () => {
    const week = weekOf(d("2028-02-29"), MONDAY);
    expect(week.days).toEqual([
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
      "2028-03-02",
      "2028-03-03",
      "2028-03-04",
      "2028-03-05",
    ]);
  });

  it("always returns seven consecutive days, whatever the start", () => {
    for (const weekStart of [0, 1, 2, 3, 4, 5, 6] as const) {
      const week = weekOf(d("2026-03-08"), weekStart);
      expect(week.days).toHaveLength(7);
      expect(week.days.at(0)).toBe(week.start);
      expect(weekdayOf(week.start)).toBe(weekStart);
      expect(diffDays(week.start, week.days.at(-1) ?? week.start)).toBe(6);
    }
  });
});
