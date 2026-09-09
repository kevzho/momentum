import { describe, expect, it } from "vitest";

import { fromLocal, ianaTimeZone, instant, localDate, localTime, UTC } from "../time";
import type { LocalDate, TimeWindow, WorkingHours } from "../types";
import {
  busyIntervals,
  commitmentsOverlapping,
  dayBounds,
  intervalMinutes,
  intervalOfSlot,
  intersectIntervals,
  intervalsOverlap,
  mergeIntervals,
  occupiesTime,
  rangeBounds,
  slotOf,
  snapInstantUp,
  subtractIntervals,
  toDayInterval,
  totalMinutes,
  windowIntervalsOn,
  workingIntervalsOn,
} from "./intervals";
import type { Commitment } from "./types";

/**
 *   America/New_York  2026-03-08 spring forward (02:00 -> 03:00)
 *                     2026-11-01 fall back      (02:00 -> 01:00)
 *   America/Santiago  2026-09-06 spring forward at midnight (no 00:00 that day)
 */
const NEW_YORK = ianaTimeZone("America/New_York");
const SANTIAGO = ianaTimeZone("America/Santiago");

const d = localDate;
const t = localTime;
const i = instant;

const MONDAY: LocalDate = d("2026-09-07");

function at(date: LocalDate, minutes: number) {
  return fromLocal(date, minutes, NEW_YORK);
}

function commitment(
  overrides: Partial<Commitment> & Pick<Commitment, "id" | "startAt" | "endAt">,
): Commitment {
  return {
    kind: "event",
    title: overrides.id,
    allDay: false,
    completedAt: null,
    taskId: null,
    taskDueDate: null,
    taskCompletedAt: null,
    ...overrides,
  };
}

const NINE_TO_FIVE: TimeWindow = { start: t("09:00"), end: t("17:00") };

describe("interval basics", () => {
  it("measures elapsed minutes and never goes negative", () => {
    expect(intervalMinutes({ startAt: at(MONDAY, 540), endAt: at(MONDAY, 630) })).toBe(90);
    expect(intervalMinutes({ startAt: at(MONDAY, 630), endAt: at(MONDAY, 540) })).toBe(0);
  });

  it("treats touching intervals as disjoint", () => {
    const a = { startAt: at(MONDAY, 540), endAt: at(MONDAY, 600) };
    const b = { startAt: at(MONDAY, 600), endAt: at(MONDAY, 660) };
    expect(intervalsOverlap(a, b)).toBe(false);
    expect(intersectIntervals(a, b)).toBeNull();
    expect(intervalsOverlap(a, { startAt: at(MONDAY, 599), endAt: at(MONDAY, 660) })).toBe(true);
  });

  it("intersects to the common part", () => {
    const a = { startAt: at(MONDAY, 540), endAt: at(MONDAY, 720) };
    const b = { startAt: at(MONDAY, 600), endAt: at(MONDAY, 900) };
    expect(intersectIntervals(a, b)).toEqual({ startAt: at(MONDAY, 600), endAt: at(MONDAY, 720) });
  });

  it("merges overlapping and touching intervals, drops empty ones, and sorts", () => {
    const merged = mergeIntervals([
      { startAt: at(MONDAY, 720), endAt: at(MONDAY, 780) },
      { startAt: at(MONDAY, 540), endAt: at(MONDAY, 600) },
      { startAt: at(MONDAY, 600), endAt: at(MONDAY, 660) },
      { startAt: at(MONDAY, 630), endAt: at(MONDAY, 700) },
      { startAt: at(MONDAY, 800), endAt: at(MONDAY, 800) },
      { startAt: at(MONDAY, 900), endAt: at(MONDAY, 850) },
    ]);
    expect(merged).toEqual([
      { startAt: at(MONDAY, 540), endAt: at(MONDAY, 700) },
      { startAt: at(MONDAY, 720), endAt: at(MONDAY, 780) },
    ]);
  });

  it("does not double-count overlaps in a total", () => {
    expect(
      totalMinutes([
        { startAt: at(MONDAY, 540), endAt: at(MONDAY, 660) },
        { startAt: at(MONDAY, 600), endAt: at(MONDAY, 720) },
      ]),
    ).toBe(180);
  });
});

describe("subtractIntervals", () => {
  const window = { startAt: at(MONDAY, 540), endAt: at(MONDAY, 1020) };

  it("returns the base untouched when there are no holes", () => {
    expect(subtractIntervals([window], [])).toEqual([window]);
  });

  it("cuts holes out of the middle, the edges, and beyond the edges", () => {
    const free = subtractIntervals(
      [window],
      [
        { startAt: at(MONDAY, 480), endAt: at(MONDAY, 600) }, // overhangs the start
        { startAt: at(MONDAY, 720), endAt: at(MONDAY, 780) }, // in the middle
        { startAt: at(MONDAY, 960), endAt: at(MONDAY, 1080) }, // overhangs the end
      ],
    );
    expect(free).toEqual([
      { startAt: at(MONDAY, 600), endAt: at(MONDAY, 720) },
      { startAt: at(MONDAY, 780), endAt: at(MONDAY, 960) },
    ]);
  });

  it("returns nothing when a hole covers the whole base", () => {
    expect(
      subtractIntervals([window], [{ startAt: at(MONDAY, 0), endAt: at(MONDAY, 1440) }]),
    ).toEqual([]);
  });

  it("handles unsorted, overlapping holes across several base intervals", () => {
    const free = subtractIntervals(
      [
        { startAt: at(MONDAY, 780), endAt: at(MONDAY, 1020) },
        { startAt: at(MONDAY, 540), endAt: at(MONDAY, 720) },
      ],
      [
        { startAt: at(MONDAY, 900), endAt: at(MONDAY, 930) },
        { startAt: at(MONDAY, 600), endAt: at(MONDAY, 660) },
        { startAt: at(MONDAY, 640), endAt: at(MONDAY, 700) },
      ],
    );
    expect(free).toEqual([
      { startAt: at(MONDAY, 540), endAt: at(MONDAY, 600) },
      { startAt: at(MONDAY, 700), endAt: at(MONDAY, 720) },
      { startAt: at(MONDAY, 780), endAt: at(MONDAY, 900) },
      { startAt: at(MONDAY, 930), endAt: at(MONDAY, 1020) },
    ]);
  });
});

describe("windows on a day", () => {
  it("resolves a working window to instants in the profile timezone", () => {
    const [window] = windowIntervalsOn(MONDAY, [NINE_TO_FIVE], NEW_YORK);
    expect(window).toEqual({
      startAt: i("2026-09-07T13:00:00.000Z"),
      endAt: i("2026-09-07T21:00:00.000Z"),
      date: MONDAY,
      startMinutes: 540,
      endMinutes: 1020,
    });
    expect(intervalMinutes(window!)).toBe(480);
  });

  it("merges overlapping windows so a duplicated row cannot double capacity", () => {
    const windows = windowIntervalsOn(
      MONDAY,
      [NINE_TO_FIVE, { start: t("13:00"), end: t("18:00") }, NINE_TO_FIVE],
      NEW_YORK,
    );
    expect(windows).toHaveLength(1);
    expect(windows[0]?.startMinutes).toBe(540);
    expect(windows[0]?.endMinutes).toBe(1080);
  });

  it("is one elapsed hour shorter across a spring-forward gap and longer across a fall-back overlap", () => {
    const earlyWindow: TimeWindow = { start: t("01:00"), end: t("04:00") };
    const [spring] = windowIntervalsOn(d("2026-03-08"), [earlyWindow], NEW_YORK);
    const [fall] = windowIntervalsOn(d("2026-11-01"), [earlyWindow], NEW_YORK);
    expect(intervalMinutes(spring!)).toBe(120);
    expect(intervalMinutes(fall!)).toBe(240);
    expect(spring?.startMinutes).toBe(60);
    expect(spring?.endMinutes).toBe(240);
    expect(fall?.startMinutes).toBe(60);
    expect(fall?.endMinutes).toBe(240);
  });

  it("drops a window whose edges both fall inside a gap", () => {
    // 02:00–03:00 does not happen on 2026-03-08 in New York; both edges resolve to the same instant.
    expect(
      windowIntervalsOn(d("2026-03-08"), [{ start: t("02:00"), end: t("03:00") }], NEW_YORK),
    ).toEqual([]);
  });

  it("reads working hours by the weekday of the date, so a day off has no windows", () => {
    const hours: WorkingHours = {
      0: [],
      1: [NINE_TO_FIVE],
      2: [NINE_TO_FIVE],
      3: [NINE_TO_FIVE],
      4: [NINE_TO_FIVE],
      5: [{ start: t("09:00"), end: t("13:00") }],
      6: [],
    };
    expect(workingIntervalsOn(MONDAY, hours, NEW_YORK)).toHaveLength(1);
    expect(intervalMinutes(workingIntervalsOn(d("2026-09-11"), hours, NEW_YORK)[0]!)).toBe(240);
    expect(workingIntervalsOn(d("2026-09-12"), hours, NEW_YORK)).toEqual([]);
    expect(workingIntervalsOn(d("2026-09-13"), hours, NEW_YORK)).toEqual([]);
  });

  it("gives a day and a range their real bounds on a transition day", () => {
    expect(intervalMinutes(dayBounds(d("2026-03-08"), NEW_YORK))).toBe(1380);
    expect(intervalMinutes(dayBounds(d("2026-11-01"), NEW_YORK))).toBe(1500);
    // Santiago moves the clock at midnight: the day starts at 01:00 local.
    expect(dayBounds(d("2026-09-06"), SANTIAGO).startAt).toBe("2026-09-06T04:00:00.000Z");
    const week = rangeBounds([d("2026-03-08"), d("2026-03-09")], NEW_YORK);
    expect(intervalMinutes(week!)).toBe(1380 + 1440);
    expect(rangeBounds([], NEW_YORK)).toBeNull();
  });
});

describe("occupiesTime (Domain Rule 13)", () => {
  const span = { startAt: at(MONDAY, 540), endAt: at(MONDAY, 600) };

  it("counts events, outstanding work, executed work and habit blocks", () => {
    expect(occupiesTime(commitment({ id: "event", ...span }))).toBe(true);
    expect(occupiesTime(commitment({ id: "work", kind: "work", taskId: "t", ...span }))).toBe(true);
    expect(
      occupiesTime(
        commitment({
          id: "done",
          kind: "work",
          taskId: "t",
          completedAt: at(MONDAY, 600),
          ...span,
        }),
      ),
    ).toBe(true);
    expect(occupiesTime(commitment({ id: "habit", kind: "habit", ...span }))).toBe(true);
  });

  it("treats an unexecuted block of a completed task as free time", () => {
    expect(
      occupiesTime(
        commitment({
          id: "settled",
          kind: "work",
          taskId: "t",
          taskCompletedAt: at(MONDAY, 0),
          ...span,
        }),
      ),
    ).toBe(false);
    // An executed block stays time that was spent.
    expect(
      occupiesTime(
        commitment({
          id: "spent",
          kind: "work",
          taskId: "t",
          taskCompletedAt: at(MONDAY, 0),
          completedAt: at(MONDAY, 600),
          ...span,
        }),
      ),
    ).toBe(true);
  });

  it("ignores all-day items and empty spans", () => {
    expect(occupiesTime(commitment({ id: "birthday", allDay: true, ...span }))).toBe(false);
    expect(
      occupiesTime(commitment({ id: "empty", startAt: at(MONDAY, 540), endAt: at(MONDAY, 540) })),
    ).toBe(false);
  });

  it("builds busy intervals from the occupying commitments only, merged", () => {
    const busy = busyIntervals([
      commitment({ id: "a", startAt: at(MONDAY, 540), endAt: at(MONDAY, 600) }),
      commitment({ id: "b", startAt: at(MONDAY, 570), endAt: at(MONDAY, 660) }),
      commitment({ id: "c", allDay: true, startAt: at(MONDAY, 0), endAt: at(MONDAY, 1440) }),
    ]);
    expect(busy).toEqual([{ startAt: at(MONDAY, 540), endAt: at(MONDAY, 660) }]);
  });

  it("lists the commitments a slot overlaps, in start order", () => {
    const overlapping = commitmentsOverlapping(
      [
        commitment({ id: "later", startAt: at(MONDAY, 620), endAt: at(MONDAY, 700) }),
        commitment({ id: "earlier", startAt: at(MONDAY, 500), endAt: at(MONDAY, 560) }),
        commitment({ id: "touching", startAt: at(MONDAY, 660), endAt: at(MONDAY, 720) }),
      ],
      { startAt: at(MONDAY, 540), endAt: at(MONDAY, 660) },
    );
    expect(overlapping.map((c) => c.id)).toEqual(["earlier", "later"]);
  });
});

describe("wall clock ↔ instants", () => {
  it("reads an interval back as the clock shows it, counting past midnight", () => {
    expect(
      toDayInterval({ startAt: at(MONDAY, 1410), endAt: at(d("2026-09-08"), 30) }, NEW_YORK),
    ).toMatchObject({ date: MONDAY, startMinutes: 1410, endMinutes: 1470 });
    expect(slotOf({ startAt: at(MONDAY, 540), endAt: at(MONDAY, 600) }, NEW_YORK)).toEqual({
      date: MONDAY,
      startMinutes: 540,
      endMinutes: 600,
    });
  });

  it("keeps the clock reading, not start plus elapsed, on a spring-forward morning", () => {
    const spring = d("2026-03-08");
    const interval = { startAt: at(spring, 60), endAt: at(spring, 180) };
    expect(intervalMinutes(interval)).toBe(60);
    expect(toDayInterval(interval, NEW_YORK)).toMatchObject({ startMinutes: 60, endMinutes: 180 });
  });

  it("resolves a slot the way the server does, round-tripping on every fixture day", () => {
    for (const [date, tz] of [
      [MONDAY, NEW_YORK],
      [d("2026-03-08"), NEW_YORK],
      [d("2026-11-01"), NEW_YORK],
      [d("2026-09-06"), SANTIAGO],
      [MONDAY, UTC],
    ] as const) {
      const interval = intervalOfSlot({ date, startMinutes: 600, endMinutes: 720 }, tz);
      expect(slotOf(interval, tz)).toEqual({ date, startMinutes: 600, endMinutes: 720 });
    }
  });

  it("keeps the drawn length for a slot straddling the far edge of a gap", () => {
    // 02:30–03:00 on the spring-forward day: the start moves to 03:30 and the end stays at 03:00.
    const interval = intervalOfSlot(
      { date: d("2026-03-08"), startMinutes: 150, endMinutes: 180 },
      NEW_YORK,
    );
    expect(intervalMinutes(interval)).toBe(30);
    expect(interval.startAt).toBe("2026-03-08T07:30:00.000Z");
  });

  it("snaps up to the next boundary and never backwards", () => {
    expect(snapInstantUp(at(MONDAY, 547), 15, NEW_YORK)).toBe(at(MONDAY, 555));
    expect(snapInstantUp(at(MONDAY, 555), 15, NEW_YORK)).toBe(at(MONDAY, 555));
    expect(snapInstantUp(at(MONDAY, 1435), 15, NEW_YORK)).toBe(at(d("2026-09-08"), 0));

    // 01:20 in the second pass of the fall-back hour: the first 01:30 is in the past.
    const secondPass = i("2026-11-01T06:20:00.000Z"); // 01:20 EST
    const snapped = snapInstantUp(secondPass, 15, NEW_YORK);
    expect(snapped).toBe("2026-11-01T06:30:00.000Z");
    expect(snapped >= secondPass).toBe(true);
  });

  // 14:30:27.456 reads 870 minutes, on the 15-minute grid, but is 27 seconds past the boundary.
  it("takes the next increment when the boundary minute is already under way", () => {
    expect(snapInstantUp(i("2026-09-07T18:30:27.456Z"), 15, NEW_YORK)).toBe(at(MONDAY, 885));
    expect(snapInstantUp(i("2026-09-07T18:30:00.003Z"), 15, NEW_YORK)).toBe(at(MONDAY, 885));
    expect(snapInstantUp(i("2026-09-07T18:30:00.000Z"), 15, NEW_YORK)).toBe(at(MONDAY, 870));
    expect(snapInstantUp(i("2026-09-07T18:31:00.000Z"), 15, NEW_YORK)).toBe(at(MONDAY, 885));
    // 23:45:00.500: the next boundary is midnight.
    expect(snapInstantUp(i("2026-09-08T03:45:00.500Z"), 15, NEW_YORK)).toBe(at(d("2026-09-08"), 0));
  });
});
