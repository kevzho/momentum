import { describe, expect, it } from "vitest";

import { localDate, UTC } from "../time";
import type { Recurrence } from "../types/calendar";
import { candidateDates, MAX_CANDIDATE_STEPS } from "./schedule";

const d = localDate;

function rule(input: Partial<Recurrence> = {}): Recurrence {
  return {
    freq: "weekly",
    interval: 1,
    byWeekday: null,
    until: null,
    count: null,
    timezone: UTC,
    ...input,
  };
}

/** 2026-09-07 is a Monday; 2026-09-09 a Wednesday. */
const MONDAY = d("2026-09-07");
const WEDNESDAY = d("2026-09-09");

describe("daily rules", () => {
  it("steps one day at a time", () => {
    expect(
      candidateDates(rule({ freq: "daily" }), MONDAY, { from: MONDAY, to: d("2026-09-11") }),
    ).toEqual(["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11"]);
  });

  it("steps by the interval", () => {
    expect(
      candidateDates(rule({ freq: "daily", interval: 3 }), MONDAY, {
        from: MONDAY,
        to: d("2026-09-16"),
      }),
    ).toEqual(["2026-09-07", "2026-09-10", "2026-09-13", "2026-09-16"]);
  });

  it("keeps the series' own phase when the range starts months later", () => {
    // 2026-01-01 → 2026-09-07 is 249 days, an exact multiple of 3, so the range opens on an occurrence.
    expect(
      candidateDates(rule({ freq: "daily", interval: 3 }), d("2026-01-01"), {
        from: MONDAY,
        to: d("2026-09-13"),
      }),
    ).toEqual(["2026-09-07", "2026-09-10", "2026-09-13"]);

    expect(
      candidateDates(rule({ freq: "daily", interval: 3 }), d("2026-01-02"), {
        from: MONDAY,
        to: d("2026-09-13"),
      }),
    ).toEqual(["2026-09-08", "2026-09-11"]);
  });

  it("finds the next occurrence when the range opens between two of them", () => {
    expect(
      candidateDates(rule({ freq: "daily", interval: 5 }), MONDAY, {
        from: d("2026-09-09"),
        to: d("2026-09-13"),
      }),
    ).toEqual(["2026-09-12"]);
  });

  it("ignores byWeekday, which is weekly-only", () => {
    expect(
      candidateDates(rule({ freq: "daily", byWeekday: [2] }), MONDAY, {
        from: MONDAY,
        to: d("2026-09-09"),
      }),
    ).toEqual(["2026-09-07", "2026-09-08", "2026-09-09"]);
  });
});

describe("weekly rules", () => {
  it("repeats the first occurrence's weekday when byWeekday is null", () => {
    expect(candidateDates(rule(), MONDAY, { from: MONDAY, to: d("2026-09-28") })).toEqual([
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
      "2026-09-28",
    ]);
  });

  it("expands every listed weekday, in date order", () => {
    expect(
      candidateDates(rule({ byWeekday: [1, 3, 5] }), MONDAY, {
        from: MONDAY,
        to: d("2026-09-16"),
      }),
    ).toEqual([
      "2026-09-07", // Mon
      "2026-09-09", // Wed
      "2026-09-11", // Fri
      "2026-09-14", // Mon
      "2026-09-16", // Wed
    ]);
  });

  it("counts weeks from the series' own start, not from a Monday", () => {
    // Week 0 of a Wednesday series is Wed…Tue, so its Monday falls five days after the start.
    expect(
      candidateDates(rule({ byWeekday: [1, 3, 5] }), WEDNESDAY, {
        from: WEDNESDAY,
        to: d("2026-09-18"),
      }),
    ).toEqual([
      "2026-09-09", // Wed, the start
      "2026-09-11", // Fri
      "2026-09-14", // Mon, still series-week 0
      "2026-09-16", // Wed
      "2026-09-18", // Fri
    ]);
  });

  it("never emits a date before the series starts", () => {
    const dates = candidateDates(rule({ byWeekday: [1, 3] }), WEDNESDAY, {
      from: d("2026-09-01"),
      to: d("2026-09-18"),
    });
    expect(dates[0]).toBe("2026-09-09");
  });

  it("finds an occurrence in a week the range only partly covers", () => {
    // The range opens midway through a series week; rounding the skip up would lose the Friday.
    expect(
      candidateDates(rule({ byWeekday: [1, 5] }), MONDAY, {
        from: d("2026-09-09"),
        to: d("2026-09-12"),
      }),
    ).toEqual(["2026-09-11"]);
  });

  it("skips whole weeks for an interval greater than one", () => {
    expect(
      candidateDates(rule({ interval: 2 }), MONDAY, { from: MONDAY, to: d("2026-10-19") }),
    ).toEqual(["2026-09-07", "2026-09-21", "2026-10-05", "2026-10-19"]);
  });

  it("expands every listed weekday only in the selected weeks", () => {
    expect(
      candidateDates(rule({ interval: 2, byWeekday: [1, 5] }), MONDAY, {
        from: MONDAY,
        to: d("2026-09-30"),
      }),
    ).toEqual(["2026-09-07", "2026-09-11", "2026-09-21", "2026-09-25"]);
  });

  it("reads an empty byWeekday as the first occurrence's weekday", () => {
    expect(
      candidateDates(rule({ byWeekday: [] }), MONDAY, { from: MONDAY, to: d("2026-09-21") }),
    ).toEqual(["2026-09-07", "2026-09-14", "2026-09-21"]);
  });

  it("deduplicates a repeated weekday rather than emitting the date twice", () => {
    expect(
      candidateDates(rule({ byWeekday: [3, 1, 3] }), MONDAY, { from: MONDAY, to: d("2026-09-09") }),
    ).toEqual(["2026-09-07", "2026-09-09"]);
  });
});

describe("stopping rules", () => {
  it("treats until as inclusive of its own date", () => {
    expect(
      candidateDates(rule({ until: d("2026-09-21") }), MONDAY, {
        from: MONDAY,
        to: d("2026-10-19"),
      }),
    ).toEqual(["2026-09-07", "2026-09-14", "2026-09-21"]);
  });

  it("stops after count occurrences even when the range runs on", () => {
    expect(
      candidateDates(rule({ count: 3 }), MONDAY, { from: MONDAY, to: d("2026-12-31") }),
    ).toEqual(["2026-09-07", "2026-09-14", "2026-09-21"]);
  });

  it("counts the occurrences the range never asked for", () => {
    // Occurrences 1 and 2 (09-07, 09-14) fall before the range and still consume their slots.
    expect(
      candidateDates(rule({ count: 3 }), MONDAY, { from: d("2026-09-19"), to: d("2026-12-31") }),
    ).toEqual(["2026-09-21"]);
    expect(
      candidateDates(rule({ count: 2 }), MONDAY, { from: d("2026-09-19"), to: d("2026-12-31") }),
    ).toEqual([]);
  });

  it("applies both when a bad write sets count and until together", () => {
    // The database trigger rejects this pair; expansion still has to cope.
    expect(
      candidateDates(rule({ count: 4, until: d("2026-09-14") }), MONDAY, {
        from: MONDAY,
        to: d("2026-12-31"),
      }),
    ).toEqual(["2026-09-07", "2026-09-14"]);
    expect(
      candidateDates(rule({ count: 1, until: d("2026-12-31") }), MONDAY, {
        from: MONDAY,
        to: d("2026-12-31"),
      }),
    ).toEqual(["2026-09-07"]);
  });

  it("honours a count of zero as a series with no occurrences", () => {
    expect(
      candidateDates(rule({ count: 0 }), MONDAY, { from: MONDAY, to: d("2026-12-31") }),
    ).toEqual([]);
  });

  it("returns nothing when the range ends before the series starts", () => {
    expect(candidateDates(rule(), MONDAY, { from: d("2026-08-01"), to: d("2026-09-06") })).toEqual(
      [],
    );
  });

  it("returns nothing when until precedes the series' own start", () => {
    expect(
      candidateDates(rule({ until: d("2026-09-01") }), MONDAY, {
        from: MONDAY,
        to: d("2026-12-31"),
      }),
    ).toEqual([]);
  });
});

describe("malformed rules", () => {
  it("reads a non-advancing interval as every", () => {
    for (const interval of [0, -5, 0.4, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        candidateDates(rule({ freq: "daily", interval }), MONDAY, {
          from: MONDAY,
          to: d("2026-09-09"),
        }),
      ).toEqual(["2026-09-07", "2026-09-08", "2026-09-09"]);
    }
  });

  it("truncates at the iteration cap instead of walking a nonsense range", () => {
    // A corrupt override date can widen the range by centuries.
    const dates = candidateDates(rule({ freq: "daily" }), MONDAY, {
      from: MONDAY,
      to: d("2999-12-31"),
    });
    expect(dates).toHaveLength(MAX_CANDIDATE_STEPS);
    expect(dates[0]).toBe("2026-09-07");
  });

  it("stays cheap when the series began long before the range", () => {
    // The walk skips to the range rather than stepping through 13,000 occurrences.
    expect(
      candidateDates(rule({ freq: "daily" }), d("1990-01-01"), {
        from: MONDAY,
        to: d("2026-09-09"),
      }),
    ).toEqual(["2026-09-07", "2026-09-08", "2026-09-09"]);
  });
});
