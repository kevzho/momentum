import { describe, expect, it } from "vitest";

import {
  addMinutes,
  diffDays,
  durationMinutes,
  fromLocal,
  ianaTimeZone,
  localDate,
  localDateOf,
  minutesFromMidnight,
} from "@momentum/core/time";
import type { Instant, LocalDate, Minutes } from "@momentum/core/types";

/**
 * A work block's round trip: stored instants → the wall-clock triple the sheet
 * edits → stored instants again.
 *
 * `groupByTask` in `queries.ts` makes the outward conversion and `spanInstants`
 * in `actions.ts` makes the return one. Neither is exported — one is
 * `server-only` and the other is inside a `"use server"` module — so the two
 * calculations are reproduced here exactly and asserted to be inverses.
 *
 * The reason this test exists is the day the two stop being inverses. A block
 * drawn 01:00–03:00 on a spring-forward morning is **60 elapsed minutes** and
 * still ends at **03:00** on the clock. Deriving the end as "start plus elapsed
 * length" — the obvious formula, and the one this file was written to catch —
 * gives 02:00, and the next edit to any other field on that block would silently
 * rewrite it an hour shorter. It is the same family as the `spanOf` defect
 * Phase 3's review found.
 */

const NY = ianaTimeZone("America/New_York");
const MINUTES_PER_DAY = 1440;

interface Projected {
  date: LocalDate;
  startMinutes: Minutes;
  endMinutes: Minutes;
  minutes: Minutes;
}

/** `groupByTask`, exactly. */
function project(startAt: Instant, endAt: Instant): Projected {
  const date = localDateOf(startAt, NY);
  return {
    date,
    startMinutes: minutesFromMidnight(startAt, NY),
    endMinutes:
      minutesFromMidnight(endAt, NY) + diffDays(date, localDateOf(endAt, NY)) * MINUTES_PER_DAY,
    minutes: durationMinutes(startAt, endAt),
  };
}

/** `spanInstants`, exactly. */
function restore(p: Projected): { startAt: Instant; endAt: Instant } {
  const startAt = fromLocal(p.date, p.startMinutes, NY);
  const endAt = fromLocal(p.date, p.endMinutes, NY);
  return endAt > startAt
    ? { startAt, endAt }
    : { startAt, endAt: addMinutes(startAt, p.endMinutes - p.startMinutes) };
}

const CASES: { name: string; day: string; start: Minutes; end: Minutes; elapsed: Minutes }[] = [
  { name: "an ordinary afternoon block", day: "2026-09-07", start: 960, end: 1005, elapsed: 45 },
  {
    name: "a block running past midnight",
    day: "2026-09-07",
    start: 23 * 60 + 30,
    end: 24 * 60 + 30,
    elapsed: 60,
  },
  {
    // 02:00 does not exist: the local day is 23 hours long.
    name: "a spring-forward morning, where the clock and the stopwatch disagree",
    day: "2026-03-08",
    start: 60,
    end: 180,
    elapsed: 60,
  },
  {
    // 01:00–02:00 happens twice: the local day is 25 hours long.
    name: "a fall-back morning, where the same reading happens twice",
    day: "2026-11-01",
    start: 60,
    end: 180,
    elapsed: 180,
  },
];

describe("a work block survives the round trip", () => {
  for (const { name, day, start, end, elapsed } of CASES) {
    it(name, () => {
      const startAt = fromLocal(localDate(day), start, NY);
      const endAt = fromLocal(localDate(day), end, NY);

      const projected = project(startAt, endAt);

      // What the sheet shows is the wall clock the user drew.
      expect(projected.date).toBe(day);
      expect(projected.startMinutes).toBe(start);
      expect(projected.endMinutes).toBe(end);
      // What coverage sums is the elapsed cost to the week (Domain Rule 3).
      expect(projected.minutes).toBe(elapsed);

      // And saving it back writes the same row it came from.
      expect(restore(projected)).toEqual({ startAt, endAt });
    });
  }

  it("is not the same as start-plus-elapsed, which is the formula this guards against", () => {
    const startAt = fromLocal(localDate("2026-03-08"), 60, NY);
    const endAt = fromLocal(localDate("2026-03-08"), 180, NY);
    const projected = project(startAt, endAt);

    // The wrong formula would say 02:00 — a time that does not exist that day.
    const naive = projected.startMinutes + projected.minutes;
    expect(naive).toBe(120);
    expect(projected.endMinutes).toBe(180);
    expect(projected.endMinutes).not.toBe(naive);
  });

  it("agrees with elapsed time on every ordinary day, so the two only part at a transition", () => {
    const projected = project(
      fromLocal(localDate("2026-09-07"), 960, NY),
      fromLocal(localDate("2026-09-07"), 1005, NY),
    );

    expect(projected.startMinutes + projected.minutes).toBe(projected.endMinutes);
  });
});
