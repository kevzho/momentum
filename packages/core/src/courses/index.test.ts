import { describe, expect, it } from "vitest";

import { localDate } from "../time";

import { courseStatus, courseWeekCount, courseWeekOf, courseWeekSpans } from "./index";

const START = localDate("2026-09-07");

describe("course weeks", () => {
  it("counts a partial last week as one, and an empty term as none", () => {
    expect(courseWeekCount(START, localDate("2026-09-13"))).toBe(1);
    expect(courseWeekCount(START, localDate("2026-09-14"))).toBe(2);
    expect(courseWeekCount(START, START)).toBe(1);
    expect(courseWeekCount(START, localDate("2026-09-06"))).toBe(0);
    expect(courseWeekCount(START, localDate("2026-12-11"))).toBe(14);
  });

  it("never names more weeks than a year holds", () => {
    expect(courseWeekCount(START, localDate("2030-01-01"))).toBe(53);
  });

  it("lays weeks out seven days from the term start and cuts the last at the term end", () => {
    const spans = courseWeekSpans(START, localDate("2026-09-23"));
    expect(spans).toEqual([
      { number: 1, start: START, end: localDate("2026-09-13") },
      { number: 2, start: localDate("2026-09-14"), end: localDate("2026-09-20") },
      { number: 3, start: localDate("2026-09-21"), end: localDate("2026-09-23") },
    ]);
  });

  it("finds the week a date is in, and nothing outside the term", () => {
    const end = localDate("2026-12-11");
    expect(courseWeekOf(START, START, end)).toBe(1);
    expect(courseWeekOf(localDate("2026-09-13"), START, end)).toBe(1);
    expect(courseWeekOf(localDate("2026-09-14"), START, end)).toBe(2);
    expect(courseWeekOf(localDate("2026-12-11"), START, end)).toBe(14);
    expect(courseWeekOf(localDate("2026-09-06"), START, end)).toBeNull();
    expect(courseWeekOf(localDate("2026-12-12"), START, end)).toBeNull();
  });

  it("says where today sits against the term", () => {
    const end = localDate("2026-12-11");
    expect(courseStatus(START, end, localDate("2026-09-01"))).toBe("upcoming");
    expect(courseStatus(START, end, START)).toBe("current");
    expect(courseStatus(START, end, end)).toBe("current");
    expect(courseStatus(START, end, localDate("2026-12-12"))).toBe("past");
  });
});
