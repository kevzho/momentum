import { describe, expect, it } from "vitest";

import type { IanaTimeZone, LocalDate } from "../types/scalars";
import { durationMinutes } from "./duration";
import { ianaTimeZone, instant, localDate, UTC } from "./scalars";
import {
  endOfDay,
  fromLocal,
  isSameLocalDay,
  localDateOf,
  localDayLengthMinutes,
  minutesFromMidnight,
  nextLocalMidnight,
  splitByLocalDay,
  startOfDay,
  todayIn,
  weekRange,
} from "./zone";

const d = localDate;
const i = instant;

/**
 * Transition instants in 2026, read out of the runtime's own tz database:
 *
 *   America/New_York  2026-03-08 07:00Z  local 02:00 -> 03:00   (-5 -> -4)
 *                     2026-11-01 06:00Z  local 02:00 -> 01:00   (-4 -> -5)
 *   Europe/London     2026-03-29 01:00Z  local 01:00 -> 02:00   ( 0 -> +1)
 *                     2026-10-25 01:00Z  local 02:00 -> 01:00   (+1 ->  0)
 *   Pacific/Auckland  2026-09-26 14:00Z  local 02:00 -> 03:00  (+12 -> +13)  (southern spring)
 *                     2026-04-04 14:00Z  local 03:00 -> 02:00  (+13 -> +12)  (southern autumn)
 *   America/Santiago  2026-09-06 04:00Z  local 00:00 -> 01:00   (-4 -> -3)   (moves at midnight)
 *                     2026-04-05 03:00Z  local 00:00 -> 23:00   (-3 -> -4)   (moves at midnight)
 *   Asia/Kolkata      no transitions, fixed +05:30
 *   UTC               no transitions
 */
const NEW_YORK = ianaTimeZone("America/New_York");
const LONDON = ianaTimeZone("Europe/London");
const KOLKATA = ianaTimeZone("Asia/Kolkata");
const AUCKLAND = ianaTimeZone("Pacific/Auckland");
const SANTIAGO = ianaTimeZone("America/Santiago");

const FIXTURE_ZONES: readonly IanaTimeZone[] = [NEW_YORK, LONDON, KOLKATA, AUCKLAND, SANTIAGO, UTC];

/** A date with no transition anywhere in the fixture set. */
const ORDINARY: LocalDate = d("2026-06-17");

describe("fromLocal / minutesFromMidnight round trip", () => {
  it("round-trips every wall-clock minute of an ordinary day in every fixture zone", () => {
    for (const tz of FIXTURE_ZONES) {
      for (let minutes = 0; minutes < 1440; minutes += 7) {
        expect(minutesFromMidnight(fromLocal(ORDINARY, minutes, tz), tz)).toBe(minutes);
        expect(localDateOf(fromLocal(ORDINARY, minutes, tz), tz)).toBe(ORDINARY);
      }
    }
  });

  it("places a wall-clock time at the zone's actual offset", () => {
    expect(fromLocal(d("2026-06-17"), 9 * 60, NEW_YORK)).toBe("2026-06-17T13:00:00.000Z");
    expect(fromLocal(d("2026-06-17"), 9 * 60, LONDON)).toBe("2026-06-17T08:00:00.000Z");
    expect(fromLocal(d("2026-06-17"), 9 * 60, AUCKLAND)).toBe("2026-06-16T21:00:00.000Z");
    expect(fromLocal(d("2026-06-17"), 9 * 60, UTC)).toBe("2026-06-17T09:00:00.000Z");
  });

  it("handles the half-hour offset zone, which whole-hour offset maths gets wrong", () => {
    // Asia/Kolkata is +05:30.
    expect(fromLocal(d("2026-09-07"), 9 * 60 + 15, KOLKATA)).toBe("2026-09-07T03:45:00.000Z");
    expect(minutesFromMidnight(i("2026-09-07T03:45:00.000Z"), KOLKATA)).toBe(555);
    expect(fromLocal(d("2026-09-07"), 0, KOLKATA)).toBe("2026-09-06T18:30:00.000Z");
    expect(localDateOf(i("2026-09-06T18:29:00.000Z"), KOLKATA)).toBe("2026-09-06");
    expect(localDateOf(i("2026-09-06T18:30:00.000Z"), KOLKATA)).toBe("2026-09-07");
  });

  it("normalises minutes outside the day by rolling into the neighbouring date", () => {
    expect(fromLocal(d("2026-09-07"), 1500, NEW_YORK)).toBe(
      fromLocal(d("2026-09-08"), 60, NEW_YORK),
    );
    expect(fromLocal(d("2026-09-07"), -30, NEW_YORK)).toBe(
      fromLocal(d("2026-09-06"), 1410, NEW_YORK),
    );
    expect(fromLocal(d("2026-09-07"), 2880, UTC)).toBe("2026-09-09T00:00:00.000Z");
  });
});

describe("fromLocal in a DST spring-forward gap", () => {
  it("moves a New York 02:30 forward to the 03:30 that really happens", () => {
    // 02:30 never occurs on 2026-03-08; the result is one gap-width later on the clock.
    const result = fromLocal(d("2026-03-08"), 150, NEW_YORK);
    expect(result).toBe("2026-03-08T07:30:00.000Z");
    expect(minutesFromMidnight(result, NEW_YORK)).toBe(210); // 03:30
  });

  it("maps the first missing minute onto the transition instant itself", () => {
    expect(fromLocal(d("2026-03-08"), 120, NEW_YORK)).toBe("2026-03-08T07:00:00.000Z");
    expect(minutesFromMidnight(i("2026-03-08T07:00:00.000Z"), NEW_YORK)).toBe(180);
  });

  it("leaves the minute before the gap alone", () => {
    expect(fromLocal(d("2026-03-08"), 119, NEW_YORK)).toBe("2026-03-08T06:59:00.000Z");
    expect(minutesFromMidnight(i("2026-03-08T06:59:00.000Z"), NEW_YORK)).toBe(119);
  });

  it("does the same in the southern hemisphere, where spring is in September", () => {
    const result = fromLocal(d("2026-09-27"), 150, AUCKLAND);
    expect(result).toBe("2026-09-26T14:30:00.000Z");
    expect(minutesFromMidnight(result, AUCKLAND)).toBe(210);
  });

  it("does the same in Europe/London, whose gap starts at 01:00", () => {
    const result = fromLocal(d("2026-03-29"), 90, LONDON);
    expect(result).toBe("2026-03-29T01:30:00.000Z");
    expect(minutesFromMidnight(result, LONDON)).toBe(150); // 02:30
  });

  it("handles a zone whose gap swallows its own midnight", () => {
    // America/Santiago moves the clock at 24:00, so 2026-09-06 has no 00:00.
    expect(fromLocal(d("2026-09-06"), 0, SANTIAGO)).toBe("2026-09-06T04:00:00.000Z");
    expect(minutesFromMidnight(i("2026-09-06T04:00:00.000Z"), SANTIAGO)).toBe(60);
    expect(localDateOf(i("2026-09-06T03:59:00.000Z"), SANTIAGO)).toBe("2026-09-05");
  });

  it("never returns an instant that is outside the gap it was asked about", () => {
    for (let minutes = 120; minutes < 180; minutes += 5) {
      const resolved = fromLocal(d("2026-03-08"), minutes, NEW_YORK);
      expect(minutesFromMidnight(resolved, NEW_YORK)).toBe(minutes + 60);
    }
  });
});

describe("fromLocal in a DST fall-back overlap", () => {
  it("takes the first of the two New York 01:30s", () => {
    // 01:00–02:00 happens twice on 2026-11-01: 05:30Z on EDT, 06:30Z on EST.
    const result = fromLocal(d("2026-11-01"), 90, NEW_YORK);
    expect(result).toBe("2026-11-01T05:30:00.000Z");
    expect(minutesFromMidnight(result, NEW_YORK)).toBe(90);
    expect(minutesFromMidnight(i("2026-11-01T06:30:00.000Z"), NEW_YORK)).toBe(90);
  });

  it("keeps fromLocal monotonic across the repeated hour", () => {
    const before = fromLocal(d("2026-11-01"), 59, NEW_YORK);
    const inside = fromLocal(d("2026-11-01"), 90, NEW_YORK);
    const after = fromLocal(d("2026-11-01"), 121, NEW_YORK);
    expect(Date.parse(before)).toBeLessThan(Date.parse(inside));
    expect(Date.parse(inside)).toBeLessThan(Date.parse(after));
  });

  it("does the same in the southern hemisphere, where autumn is in April", () => {
    const result = fromLocal(d("2026-04-05"), 150, AUCKLAND);
    expect(result).toBe("2026-04-04T13:30:00.000Z");
    expect(minutesFromMidnight(result, AUCKLAND)).toBe(150);
    expect(minutesFromMidnight(i("2026-04-04T14:30:00.000Z"), AUCKLAND)).toBe(150);
  });

  it("does the same in Europe/London", () => {
    expect(fromLocal(d("2026-10-25"), 90, LONDON)).toBe("2026-10-25T00:30:00.000Z");
  });

  it("handles a zone whose overlap is the last hour of the day", () => {
    // America/Santiago repeats 23:00–24:00 on 2026-04-04.
    expect(fromLocal(d("2026-04-04"), 1410, SANTIAGO)).toBe("2026-04-05T02:30:00.000Z");
    expect(minutesFromMidnight(i("2026-04-05T03:30:00.000Z"), SANTIAGO)).toBe(1410);
  });
});

describe("startOfDay / endOfDay", () => {
  it("is the first instant of the local day, not UTC midnight", () => {
    expect(startOfDay(d("2026-09-07"), NEW_YORK)).toBe("2026-09-07T04:00:00.000Z");
    expect(startOfDay(d("2026-09-07"), KOLKATA)).toBe("2026-09-06T18:30:00.000Z");
    expect(startOfDay(d("2026-09-07"), UTC)).toBe("2026-09-07T00:00:00.000Z");
  });

  it("ends a day exclusively, at the next day's start", () => {
    expect(endOfDay(d("2026-09-07"), NEW_YORK)).toBe(startOfDay(d("2026-09-08"), NEW_YORK));
    expect(endOfDay(d("2026-09-30"), NEW_YORK)).toBe(startOfDay(d("2026-10-01"), NEW_YORK));
  });

  it("gives a 23- or 25-hour day on a transition date", () => {
    expect(
      durationMinutes(startOfDay(d("2026-03-08"), NEW_YORK), endOfDay(d("2026-03-08"), NEW_YORK)),
    ).toBe(1380);
    expect(
      durationMinutes(startOfDay(d("2026-11-01"), NEW_YORK), endOfDay(d("2026-11-01"), NEW_YORK)),
    ).toBe(1500);
  });
});

describe("localDayLengthMinutes", () => {
  it("is 1440 on an ordinary day in every fixture zone", () => {
    for (const tz of FIXTURE_ZONES) {
      expect(localDayLengthMinutes(ORDINARY, tz)).toBe(1440);
    }
  });

  it("is 1380 on a spring-forward day and 1500 on a fall-back day", () => {
    expect(localDayLengthMinutes(d("2026-03-08"), NEW_YORK)).toBe(1380);
    expect(localDayLengthMinutes(d("2026-11-01"), NEW_YORK)).toBe(1500);
    expect(localDayLengthMinutes(d("2026-09-27"), AUCKLAND)).toBe(1380);
    expect(localDayLengthMinutes(d("2026-04-05"), AUCKLAND)).toBe(1500);
    expect(localDayLengthMinutes(d("2026-09-06"), SANTIAGO)).toBe(1380);
    expect(localDayLengthMinutes(d("2026-04-04"), SANTIAGO)).toBe(1500);
  });
});

describe("todayIn / isSameLocalDay", () => {
  it("puts 23:30 local on today and 00:30 local on tomorrow (Domain Rule 4)", () => {
    const lateMonday = fromLocal(d("2026-09-07"), 1410, NEW_YORK);
    const earlyTuesday = fromLocal(d("2026-09-08"), 30, NEW_YORK);
    expect(todayIn(NEW_YORK, lateMonday)).toBe("2026-09-07");
    expect(todayIn(NEW_YORK, earlyTuesday)).toBe("2026-09-08");
    expect(isSameLocalDay(lateMonday, earlyTuesday, NEW_YORK)).toBe(false);
  });

  it("disagrees with UTC for exactly the instants Domain Rule 4 is about", () => {
    // 2026-09-08T03:30Z is 23:30 on the 7th in New York.
    const lateMonday = i("2026-09-08T03:30:00.000Z");
    expect(todayIn(NEW_YORK, lateMonday)).toBe("2026-09-07");
    expect(todayIn(UTC, lateMonday)).toBe("2026-09-08");
  });

  it("treats two instants 23 hours apart as the same day when the day is 25 hours long", () => {
    const early = fromLocal(d("2026-11-01"), 30, NEW_YORK);
    const late = fromLocal(d("2026-11-01"), 1410, NEW_YORK);
    expect(isSameLocalDay(early, late, NEW_YORK)).toBe(true);
    expect(durationMinutes(early, late)).toBe(1440); // 24h elapsed, still one local day
  });

  it("answers differently for the same instant in different zones", () => {
    const moment = i("2026-09-07T20:00:00.000Z");
    expect(todayIn(NEW_YORK, moment)).toBe("2026-09-07");
    expect(todayIn(AUCKLAND, moment)).toBe("2026-09-08");
  });
});

describe("nextLocalMidnight", () => {
  it("is the next local 00:00, not now plus 24 hours", () => {
    const now = fromLocal(d("2026-09-07"), 22 * 60, NEW_YORK);
    expect(nextLocalMidnight(NEW_YORK, now)).toBe("2026-09-08T04:00:00.000Z");
    expect(durationMinutes(now, nextLocalMidnight(NEW_YORK, now))).toBe(120);
  });

  it("is 23 hours out on the day before a spring forward and 25 on a fall back", () => {
    const springMorning = fromLocal(d("2026-03-08"), 0, NEW_YORK);
    expect(durationMinutes(springMorning, nextLocalMidnight(NEW_YORK, springMorning))).toBe(1380);
    const fallMorning = fromLocal(d("2026-11-01"), 0, NEW_YORK);
    expect(durationMinutes(fallMorning, nextLocalMidnight(NEW_YORK, fallMorning))).toBe(1500);
  });

  it("lands on the transition instant in a zone that skips midnight", () => {
    // 2026-09-06T00:00 does not exist in Santiago; the local date changes at 01:00.
    const now = fromLocal(d("2026-09-05"), 1410, SANTIAGO);
    expect(nextLocalMidnight(SANTIAGO, now)).toBe("2026-09-06T04:00:00.000Z");
    expect(todayIn(SANTIAGO, nextLocalMidnight(SANTIAGO, now))).toBe("2026-09-06");
  });

  it("is always strictly in the future and lands on the following local date", () => {
    for (const tz of FIXTURE_ZONES) {
      const now = i("2026-09-07T00:00:00.000Z");
      const next = nextLocalMidnight(tz, now);
      expect(Date.parse(next)).toBeGreaterThan(Date.parse(now));
      expect(localDateOf(next, tz)).not.toBe(localDateOf(now, tz));
    }
  });
});

describe("splitByLocalDay", () => {
  it("returns one entry for a span inside a single day", () => {
    expect(
      splitByLocalDay(
        fromLocal(d("2026-09-07"), 9 * 60, NEW_YORK),
        fromLocal(d("2026-09-07"), 10 * 60 + 30, NEW_YORK),
        NEW_YORK,
      ),
    ).toEqual([{ date: "2026-09-07", startMinutes: 540, endMinutes: 630 }]);
  });

  it("splits a span that crosses midnight into today's and tomorrow's columns", () => {
    expect(
      splitByLocalDay(
        fromLocal(d("2026-09-07"), 1410, NEW_YORK),
        fromLocal(d("2026-09-08"), 30, NEW_YORK),
        NEW_YORK,
      ),
    ).toEqual([
      { date: "2026-09-07", startMinutes: 1410, endMinutes: 1440 },
      { date: "2026-09-08", startMinutes: 0, endMinutes: 30 },
    ]);
  });

  it("gives a full-day middle entry when a span crosses two midnights", () => {
    expect(
      splitByLocalDay(
        fromLocal(d("2026-09-07"), 1380, NEW_YORK),
        fromLocal(d("2026-09-09"), 60, NEW_YORK),
        NEW_YORK,
      ),
    ).toEqual([
      { date: "2026-09-07", startMinutes: 1380, endMinutes: 1440 },
      { date: "2026-09-08", startMinutes: 0, endMinutes: 1440 },
      { date: "2026-09-09", startMinutes: 0, endMinutes: 60 },
    ]);
  });

  it("ends the last segment at midnight rather than opening an empty next day", () => {
    expect(
      splitByLocalDay(
        fromLocal(d("2026-09-07"), 1320, NEW_YORK),
        fromLocal(d("2026-09-08"), 0, NEW_YORK),
        NEW_YORK,
      ),
    ).toEqual([{ date: "2026-09-07", startMinutes: 1320, endMinutes: 1440 }]);
  });

  it("ends a to-midnight segment at wall-clock 1440 on both DST days", () => {
    // Wall clock, not elapsed time: both segments end at 1440 even though the
    // days are 25 and 23 hours long.
    expect(
      splitByLocalDay(
        fromLocal(d("2026-11-01"), 1410, NEW_YORK),
        fromLocal(d("2026-11-02"), 30, NEW_YORK),
        NEW_YORK,
      ),
    ).toEqual([
      { date: "2026-11-01", startMinutes: 1410, endMinutes: 1440 },
      { date: "2026-11-02", startMinutes: 0, endMinutes: 30 },
    ]);
    expect(
      splitByLocalDay(
        fromLocal(d("2026-03-08"), 1410, NEW_YORK),
        fromLocal(d("2026-03-09"), 30, NEW_YORK),
        NEW_YORK,
      ),
    ).toEqual([
      { date: "2026-03-08", startMinutes: 1410, endMinutes: 1440 },
      { date: "2026-03-09", startMinutes: 0, endMinutes: 30 },
    ]);
    expect(localDayLengthMinutes(d("2026-11-01"), NEW_YORK)).toBe(1500);
    expect(localDayLengthMinutes(d("2026-03-08"), NEW_YORK)).toBe(1380);
  });

  it("splits a span that crosses a midnight in a zone that transitions at midnight", () => {
    expect(
      splitByLocalDay(
        fromLocal(d("2026-09-05"), 1410, SANTIAGO),
        fromLocal(d("2026-09-06"), 90, SANTIAGO),
        SANTIAGO,
      ),
    ).toEqual([
      { date: "2026-09-05", startMinutes: 1410, endMinutes: 1440 },
      { date: "2026-09-06", startMinutes: 60, endMinutes: 90 },
    ]);
  });

  it("returns nothing for an empty or inverted span", () => {
    expect(splitByLocalDay(i("2026-09-07T14:00:00Z"), i("2026-09-07T14:00:00Z"), NEW_YORK)).toEqual(
      [],
    );
    expect(splitByLocalDay(i("2026-09-07T15:00:00Z"), i("2026-09-07T14:00:00Z"), NEW_YORK)).toEqual(
      [],
    );
  });

  it("covers the span exactly: every segment is contiguous and dated in order", () => {
    const segments = splitByLocalDay(
      fromLocal(d("2026-10-30"), 1200, LONDON),
      fromLocal(d("2026-11-02"), 200, LONDON),
      LONDON,
    );
    expect(segments.map((s) => s.date)).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
    expect(segments.at(0)?.startMinutes).toBe(1200);
    expect(segments.at(-1)?.endMinutes).toBe(200);
  });
});

describe("weekRange", () => {
  it("is the half-open UTC window covering seven local days", () => {
    const range = weekRange(d("2026-09-09"), 1, NEW_YORK);
    expect(range).toEqual({
      start: "2026-09-07T04:00:00.000Z",
      end: "2026-09-14T04:00:00.000Z",
    });
    expect(durationMinutes(range.start, range.end)).toBe(7 * 1440);
  });

  it("follows the week-start preference", () => {
    expect(weekRange(d("2026-09-09"), 0, UTC)).toEqual({
      start: "2026-09-06T00:00:00.000Z",
      end: "2026-09-13T00:00:00.000Z",
    });
    expect(weekRange(d("2026-09-09"), 1, UTC)).toEqual({
      start: "2026-09-07T00:00:00.000Z",
      end: "2026-09-14T00:00:00.000Z",
    });
  });

  it("is 167 hours wide across a spring-forward week and 169 across a fall-back week", () => {
    const spring = weekRange(d("2026-03-08"), 0, NEW_YORK);
    expect(spring).toEqual({
      start: "2026-03-08T05:00:00.000Z",
      end: "2026-03-15T04:00:00.000Z",
    });
    expect(durationMinutes(spring.start, spring.end)).toBe(7 * 1440 - 60);

    const fall = weekRange(d("2026-11-01"), 0, NEW_YORK);
    expect(durationMinutes(fall.start, fall.end)).toBe(7 * 1440 + 60);
  });

  it("starts at the real start of the first day when that day has no midnight", () => {
    // Santiago's 2026-09-06 begins at 01:00 local.
    expect(weekRange(d("2026-09-09"), 0, SANTIAGO).start).toBe("2026-09-06T04:00:00.000Z");
  });

  it("agrees with startOfDay and endOfDay at both edges, in every fixture zone", () => {
    for (const tz of FIXTURE_ZONES) {
      const range = weekRange(d("2026-09-09"), 1, tz);
      expect(range.start).toBe(startOfDay(d("2026-09-07"), tz));
      expect(range.end).toBe(endOfDay(d("2026-09-13"), tz));
    }
  });
});
