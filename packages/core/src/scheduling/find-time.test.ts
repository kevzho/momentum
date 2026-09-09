import { describe, expect, it } from "vitest";

import {
  durationMinutes,
  fromLocal,
  ianaTimeZone,
  instant,
  localDate,
  localTime,
  minutesOfLocalTime,
  weekOf,
} from "../time";
import type { IanaTimeZone, LocalDate, TimeWindow, Weekday, WorkingHours } from "../types";
import { DEFAULT_FIND_TIME_LIMIT, findTime, PER_DAY_LIMIT, SUGGESTION_WINDOW } from "./find-time";
import { intervalOfSlot } from "./intervals";
import type { Commitment, FindTimeInput, FindTimeResult, PlanningContext } from "./types";

/**
 * Hand-built weeks, no mocks. The suite runs under `TZ=UTC` and
 * `TZ=America/Los_Angeles`; every assertion below is in the profile
 * timezone, so a function that read the process timezone would fail one of
 * the two runs.
 *
 *   America/New_York  2026-03-08 spring forward (02:00 -> 03:00), a Sunday
 *                     2026-11-01 fall back      (02:00 -> 01:00), a Sunday
 *   America/Santiago  2026-09-06 spring forward at midnight: the day starts at 01:00
 */
const NEW_YORK = ianaTimeZone("America/New_York");
const SANTIAGO = ianaTimeZone("America/Santiago");

const d = localDate;
const t = localTime;
const i = instant;

const MONDAY = d("2026-09-07");
const TUESDAY = d("2026-09-08");
const WEDNESDAY = d("2026-09-09");
const THURSDAY = d("2026-09-10");
const FRIDAY = d("2026-09-11");
const SATURDAY = d("2026-09-12");
const SUNDAY = d("2026-09-13");
const WEEK = weekOf(MONDAY, 1).days;

const SPRING_FORWARD = d("2026-03-08");
const FALL_BACK = d("2026-11-01");
const SANTIAGO_SPRING = d("2026-09-06");

function at(date: LocalDate, minutes: number, tz: IanaTimeZone = NEW_YORK) {
  return fromLocal(date, minutes, tz);
}

function block(
  title: string,
  date: LocalDate,
  startMinutes: number,
  endMinutes: number,
  overrides: Partial<Commitment> = {},
): Commitment {
  return {
    id: `${title}/${date}/${startMinutes}`,
    kind: "event",
    title,
    startAt: at(date, startMinutes),
    endAt: at(date, endMinutes),
    allDay: false,
    completedAt: null,
    taskId: null,
    taskDueDate: null,
    taskCompletedAt: null,
    ...overrides,
  };
}

function allDay(title: string, date: LocalDate): Commitment {
  return block(title, date, 0, 1440);
}

/** Books everything outside 09:00–17:00, so the day has exactly one open window. */
function bookedOutsideHours(date: LocalDate): Commitment[] {
  return [block("Morning", date, 0, 540), block("Evening", date, 1020, 1440)];
}

const NINE_TO_FIVE: TimeWindow = { start: t("09:00"), end: t("17:00") };
const NO_HOURS: WorkingHours = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };

function hours(
  windows: TimeWindow[],
  weekdays: readonly Weekday[] = [1, 2, 3, 4, 5],
): WorkingHours {
  const result: WorkingHours = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const weekday of weekdays) result[weekday] = windows;
  return result;
}

const WEEKDAYS_NINE_TO_FIVE = hours([NINE_TO_FIVE]);

function context(overrides: Partial<PlanningContext> = {}): PlanningContext {
  return {
    timezone: NEW_YORK,
    workingHours: WEEKDAYS_NINE_TO_FIVE,
    focusWindows: [],
    days: WEEK,
    today: MONDAY,
    ...overrides,
  };
}

function input(overrides: Partial<FindTimeInput> = {}): FindTimeInput {
  return {
    task: { id: "task", title: "History essay", dueDate: null },
    durationMinutes: 60,
    commitments: [],
    context: context(),
    now: at(MONDAY, 0),
    snapMinutes: 15,
    ...overrides,
  };
}

/** `[date, startMinutes, endMinutes]` per candidate, in rank order. */
function slots(result: FindTimeResult): [LocalDate, number, number][] {
  return result.candidates.map((c) => [c.span.date, c.span.startMinutes, c.span.endMinutes]);
}

function explanations(result: FindTimeResult): string[] {
  return result.candidates.map((c) => c.explanation);
}

/* -------------------------------------------------------------------------- */

describe("the search span", () => {
  it("offers nothing for an empty range", () => {
    expect(findTime(input({ context: context({ days: [] }) }))).toEqual({
      outcome: "nothing",
      candidates: [],
      note: "There are no days in this range.",
    });
  });

  it("reports a range every day of which has already passed", () => {
    const nextMonday = d("2026-09-14");
    const result = findTime(
      input({ context: context({ today: nextMonday }), now: at(nextMonday, 0) }),
    );
    expect(result.outcome).toBe("range-past");
    expect(result.candidates).toEqual([]);
    expect(result.note).toBe("Every day in this range has already passed.");
  });

  it("skips the days before today", () => {
    const result = findTime(
      input({ context: context({ today: WEDNESDAY }), now: at(WEDNESDAY, 0) }),
    );
    expect(result.outcome).toBe("found");
    expect(slots(result)[0]).toEqual([WEDNESDAY, 540, 600]);
    expect(result.candidates.every((c) => c.span.date >= WEDNESDAY)).toBe(true);
  });

  it("never starts before now, and snaps the first opening up rather than down", () => {
    // 09:00 opened two hours ago; at 10:37 the earliest suggestion is 10:45.
    const now = at(MONDAY, 637);
    const result = findTime(input({ now }));
    expect(slots(result)[0]).toEqual([MONDAY, 645, 705]);
    expect(result.candidates.every((c) => c.startAt >= now)).toBe(true);
  });

  it("honours the profile's snap increment", () => {
    const now = at(MONDAY, 637);
    expect(slots(findTime(input({ now, snapMinutes: 5 })))[0]).toEqual([MONDAY, 640, 700]);
    expect(slots(findTime(input({ now, snapMinutes: 15 })))[0]).toEqual([MONDAY, 645, 705]);
    expect(slots(findTime(input({ now, snapMinutes: 30 })))[0]).toEqual([MONDAY, 660, 720]);
  });

  it("still offers today's opening when now carries seconds or milliseconds", () => {
    // `now` is a millisecond clock, and 14:30:27.456 reads 870 minutes — on
    // the 15-minute grid, so the snap has to move to 14:45 rather than return
    // an instant no wall-clock span resolves to. It used to return it, and the
    // day's entire free window went with the candidate.
    for (const now of [i("2026-09-07T18:30:00.003Z"), i("2026-09-07T18:30:27.456Z")]) {
      const result = findTime(input({ now, context: context({ days: [MONDAY] }) }));
      expect(result.outcome).toBe("found");
      expect(slots(result)).toEqual([[MONDAY, 885, 945]]);
      expect(result.candidates.every((c) => c.startAt >= now)).toBe(true);
    }
  });

  it("does not let a start rejected by one opening blank the next", () => {
    // The 15-minute gap at 10:40 snaps to 11:00, which does not fit inside it.
    // The 11:00–12:00 opening's own start is the same instant, and it is the
    // only candidate of the day inside working hours.
    const result = findTime(
      input({
        durationMinutes: 15,
        snapMinutes: 30,
        context: context({ days: [MONDAY] }),
        commitments: [
          block("Morning", MONDAY, 540, 640),
          block("Standup", MONDAY, 655, 660),
          block("Afternoon", MONDAY, 720, 1020),
        ],
      }),
    );
    expect(slots(result)).toEqual([
      [MONDAY, 660, 675],
      [MONDAY, 420, 435],
      [MONDAY, 1020, 1035],
    ]);
  });

  it("returns the default limit, one candidate per open weekday, earliest first", () => {
    const result = findTime(input());
    expect(result.outcome).toBe("found");
    expect(result.note).toBeNull();
    expect(result.candidates).toHaveLength(DEFAULT_FIND_TIME_LIMIT);
    expect(slots(result)).toEqual([
      [MONDAY, 540, 600],
      [TUESDAY, 540, 600],
      [WEDNESDAY, 540, 600],
      [THURSDAY, 540, 600],
      [FRIDAY, 540, 600],
    ]);
  });

  it("floors the duration at one minute and honours an explicit limit", () => {
    const result = findTime(input({ durationMinutes: 0, limit: 2 }));
    expect(result.candidates).toHaveLength(2);
    for (const c of result.candidates) expect(durationMinutes(c.startAt, c.endAt)).toBe(1);
  });
});

describe("each ranking rule in isolation", () => {
  it("1. before the deadline — outranks working hours: an off-hours slot before beats an in-hours slot after", () => {
    // Wednesday is a day off; Thursday is a working day; the task is due Wednesday.
    const result = findTime(
      input({
        task: { id: "task", title: "Essay", dueDate: WEDNESDAY },
        context: context({
          days: [WEDNESDAY, THURSDAY],
          today: WEDNESDAY,
          workingHours: hours([NINE_TO_FIVE], [4]),
        }),
        now: at(WEDNESDAY, 0),
        commitments: bookedOutsideHours(THURSDAY),
      }),
    );
    expect(slots(result)).toEqual([
      [WEDNESDAY, 420, 480],
      [THURSDAY, 540, 600],
    ]);
    expect(result.candidates.map((c) => c.score.beforeDeadline)).toEqual([true, false]);
    expect(result.candidates.map((c) => c.score.withinWorkingHours)).toEqual([false, true]);
  });

  it("1. before the deadline — a slot ending at the last minute of the due date is before it", () => {
    const result = findTime(
      input({
        task: { id: "task", title: "Essay", dueDate: WEDNESDAY },
        snapMinutes: 1,
        context: context({
          days: [WEDNESDAY, THURSDAY],
          today: WEDNESDAY,
          workingHours: hours([NINE_TO_FIVE, { start: t("22:00"), end: t("23:59") }], [3, 4]),
        }),
        now: at(WEDNESDAY, 0),
        commitments: [
          block("Day", WEDNESDAY, 0, 1379),
          block("Late", WEDNESDAY, 1439, 1440),
          ...bookedOutsideHours(THURSDAY),
        ],
      }),
    );
    expect(slots(result)).toEqual([
      [WEDNESDAY, 1379, 1439],
      [THURSDAY, 540, 600],
    ]);
    expect(result.candidates[0]?.score.beforeDeadline).toBe(true);
    expect(result.candidates[1]?.score.beforeDeadline).toBe(false);
  });

  it("2. within working hours — beats an earlier slot outside them", () => {
    const result = findTime(input({ context: context({ days: [MONDAY] }) }));
    expect(slots(result)).toEqual([
      [MONDAY, 540, 600],
      [MONDAY, 420, 480],
    ]);
    expect(result.candidates.map((c) => c.score.withinWorkingHours)).toEqual([true, false]);
  });

  it("3. fewest conflicts — in the fallback path, a later slot over one block beats an earlier slot over two", () => {
    const result = findTime(
      input({
        limit: 6,
        commitments: [
          allDay("Mon all day", MONDAY),
          block("Tue morning", TUESDAY, 0, 570),
          block("Tue rest", TUESDAY, 570, 1440),
          allDay("Wed all day", WEDNESDAY),
          allDay("Thu all day", THURSDAY),
          allDay("Fri all day", FRIDAY),
          allDay("Sat all day", SATURDAY),
          allDay("Sun all day", SUNDAY),
        ],
      }),
    );
    expect(result.outcome).toBe("fallback-overlaps");
    expect(slots(result)).toEqual([
      [MONDAY, 540, 600],
      [TUESDAY, 570, 630],
      [WEDNESDAY, 540, 600],
      [THURSDAY, 540, 600],
      [FRIDAY, 540, 600],
      [TUESDAY, 540, 600],
    ]);
    expect(result.candidates.map((c) => c.score.conflicts)).toEqual([1, 1, 1, 1, 1, 2]);
    expect(result.candidates[5]?.overlaps).toEqual(["Tue morning", "Tue rest"]);
    expect(result.candidates.every((c) => c.openWindowMinutes === 0)).toBe(true);
    expect(result.note).toBe(
      "There is no open time in this range; these times overlap existing blocks.",
    );
  });

  it("4. fragmentation — a window that would leave a 15-minute scrap ranks after a window that would not", () => {
    // 10:00–11:15 (75m) and 13:00–16:00 (3h). A 60m block at 10:00 leaves 15
    // minutes: at least one snap increment, under the useful minimum.
    const commitments = [
      block("Morning", MONDAY, 0, 600),
      block("Lunch", MONDAY, 675, 780),
      block("Evening", MONDAY, 960, 1440),
    ];
    const withSnap15 = findTime(input({ commitments, context: context({ days: [MONDAY] }) }));
    expect(slots(withSnap15)).toEqual([
      [MONDAY, 780, 840],
      [MONDAY, 600, 660],
    ]);
    expect(withSnap15.candidates.map((c) => c.score.fragments)).toEqual([0, 1]);
    expect(withSnap15.candidates.map((c) => c.openWindowMinutes)).toEqual([180, 75]);

    // With a 30-minute snap the 15-minute scrap could never hold a block
    // anyway, so it is not a fragment and the earlier slot wins.
    const withSnap30 = findTime(
      input({ commitments, snapMinutes: 30, context: context({ days: [MONDAY] }) }),
    );
    expect(slots(withSnap30)).toEqual([
      [MONDAY, 600, 660],
      [MONDAY, 780, 840],
    ]);
    expect(withSnap30.candidates.map((c) => c.score.fragments)).toEqual([0, 0]);
  });

  it("5. focus windows — a slot inside one beats an earlier slot outside, and partial overlap sits between", () => {
    const result = findTime(
      input({
        context: context({
          days: [MONDAY],
          focusWindows: [{ start: t("14:00"), end: t("16:00") }],
        }),
      }),
    );
    expect(slots(result)).toEqual([
      [MONDAY, 840, 900],
      [MONDAY, 540, 600],
      [MONDAY, 420, 480],
    ]);
    expect(result.candidates.map((c) => c.score.focusFit)).toEqual([2, 0, 0]);

    const partial = findTime(
      input({
        context: context({
          days: [MONDAY],
          focusWindows: [{ start: t("09:30"), end: t("10:30") }],
        }),
      }),
    );
    expect(slots(partial)).toEqual([
      [MONDAY, 570, 630],
      [MONDAY, 540, 600],
      [MONDAY, 420, 480],
    ]);
    expect(partial.candidates.map((c) => c.score.focusFit)).toEqual([2, 1, 0]);
  });

  it("6. earlier start — the tie-break when every criterion agrees", () => {
    const result = findTime(input({ context: context({ days: [TUESDAY, MONDAY] }) }));
    expect(slots(result).slice(0, 2)).toEqual([
      [MONDAY, 540, 600],
      [TUESDAY, 540, 600],
    ]);
  });

  it("with no focus windows configured, every candidate is neutral on focus", () => {
    expect(findTime(input()).candidates.every((c) => c.score.focusFit === 0)).toBe(true);
  });
});

describe("determinism", () => {
  const commitments = [
    block("Standup", MONDAY, 540, 570),
    block("Review", MONDAY, 600, 720),
    block("Lunch", TUESDAY, 720, 780),
    block("Planning", WEDNESDAY, 840, 960),
    allDay("Offsite", THURSDAY),
    block("Retro", FRIDAY, 900, 960),
  ];

  it("gives deep-equal results for the same input", () => {
    const a = findTime(input({ commitments, durationMinutes: 90 }));
    const b = findTime(input({ commitments, durationMinutes: 90 }));
    expect(a).toEqual(b);
  });

  it("does not depend on the order of the commitments", () => {
    const reference = findTime(input({ commitments, durationMinutes: 90 }));
    const reversed = findTime(
      input({ commitments: commitments.slice().reverse(), durationMinutes: 90 }),
    );
    const rotated = findTime(
      input({
        commitments: [...commitments.slice(3), ...commitments.slice(0, 3)],
        durationMinutes: 90,
      }),
    );
    expect(reversed).toEqual(reference);
    expect(rotated).toEqual(reference);
  });

  it("names overlapped blocks in the same order however the commitments arrive", () => {
    const booked = [
      block("Tue rest", TUESDAY, 570, 1440),
      block("Tue morning", TUESDAY, 0, 570),
      ...[MONDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY].map((date) =>
        allDay("Busy", date),
      ),
    ];
    const forward = findTime(
      input({
        commitments: booked,
        limit: 6,
        context: context({ days: [TUESDAY], today: TUESDAY }),
        now: at(TUESDAY, 0),
      }),
    );
    const backward = findTime(
      input({
        commitments: booked.slice().reverse(),
        limit: 6,
        context: context({ days: [TUESDAY], today: TUESDAY }),
        now: at(TUESDAY, 0),
      }),
    );
    expect(forward).toEqual(backward);
    expect(forward.candidates.find((c) => c.span.startMinutes === 540)?.overlaps).toEqual([
      "Tue morning",
      "Tue rest",
    ]);
  });
});

describe("a fully booked week", () => {
  it("offers slots outside working hours, inside the suggestion window, when working hours are full", () => {
    const result = findTime(
      input({
        task: { id: "task", title: "Essay", dueDate: FRIDAY },
        commitments: WEEK.map((date) => block("Work", date, 540, 1020)),
      }),
    );
    expect(result.outcome).toBe("found");
    expect(slots(result)).toEqual([
      [MONDAY, 420, 480],
      [MONDAY, 1020, 1080],
      [TUESDAY, 420, 480],
      [TUESDAY, 1020, 1080],
      [WEDNESDAY, 420, 480],
    ]);
    const windowStart = minutesOfLocalTime(SUGGESTION_WINDOW.start);
    const windowEnd = minutesOfLocalTime(SUGGESTION_WINDOW.end);
    for (const c of result.candidates) {
      expect(c.score.withinWorkingHours).toBe(false);
      expect(c.score.conflicts).toBe(0);
      expect(c.span.startMinutes).toBeGreaterThanOrEqual(windowStart);
      expect(c.span.endMinutes).toBeLessThanOrEqual(windowEnd);
    }
  });

  it("never offers a free slot outside the suggestion window unless working hours cover it", () => {
    // Free only from 22:00: valid free time, useless suggestion — unless the
    // user works evenings, in which case it is working hours and is offered.
    const commitments = WEEK.map((date) => block("Busy", date, 0, 1320));
    const dayWorker = findTime(input({ commitments }));
    expect(dayWorker.outcome).toBe("fallback-overlaps");
    expect(dayWorker.candidates.every((c) => c.score.conflicts > 0)).toBe(true);

    const eveningWorker = findTime(
      input({
        commitments,
        context: context({ workingHours: hours([{ start: t("22:00"), end: t("23:59") }]) }),
      }),
    );
    expect(eveningWorker.outcome).toBe("found");
    expect(slots(eveningWorker)[0]).toEqual([MONDAY, 1320, 1380]);
    expect(eveningWorker.candidates[0]?.score.withinWorkingHours).toBe(true);
  });

  it("falls back to overlapping slots, naming the blocks, when every minute is booked", () => {
    const result = findTime(input({ commitments: WEEK.map((date) => allDay("All day", date)) }));
    expect(result.outcome).toBe("fallback-overlaps");
    expect(slots(result)).toEqual([
      [MONDAY, 540, 600],
      [TUESDAY, 540, 600],
      [WEDNESDAY, 540, 600],
      [THURSDAY, 540, 600],
      [FRIDAY, 540, 600],
    ]);
    for (const c of result.candidates) {
      expect(c.score.conflicts).toBe(1);
      expect(c.overlaps).toEqual(["All day"]);
      expect(c.score.withinWorkingHours).toBe(true);
    }
    expect(result.note).toBe(
      "There is no open time in this range; these times overlap existing blocks.",
    );
  });

  it("treats an unexecuted block of a completed task as free time (Domain Rule 13)", () => {
    const settled = WEEK.map((date) =>
      block("Settled", date, 0, 1440, {
        kind: "work",
        taskId: "done",
        taskCompletedAt: at(MONDAY, 0),
      }),
    );
    const result = findTime(input({ commitments: settled }));
    expect(result.outcome).toBe("found");
    expect(result.candidates.every((c) => c.score.conflicts === 0)).toBe(true);
  });
});

describe("a task longer than any gap", () => {
  it("offers overlapping slots and names the longest open window", () => {
    const commitments = WEEK.flatMap((date) => [
      block("Morning", date, 0, 540),
      block("Rest", date, 660, 1440),
    ]);
    const result = findTime(input({ commitments, durationMinutes: 180 }));
    expect(result.outcome).toBe("fallback-overlaps");
    expect(result.note).toBe(
      "No open window in this range fits 3h; the longest open window is 2h on Mon Sep 7. These times overlap existing blocks.",
    );
    expect(slots(result)).toEqual([
      [MONDAY, 540, 720],
      [TUESDAY, 540, 720],
      [WEDNESDAY, 540, 720],
      [THURSDAY, 540, 720],
      [FRIDAY, 540, 720],
    ]);
    expect(result.candidates[0]?.overlaps).toEqual(["Rest"]);
    expect(result.candidates[0]?.score.fragments).toBe(0);
  });

  it("offers nothing for a block longer than a day and says it can be split", () => {
    const result = findTime(input({ durationMinutes: 1500 }));
    expect(result.outcome).toBe("longer-than-any-gap");
    expect(result.candidates).toEqual([]);
    expect(result.note).toBe(
      "25h is longer than a day; it can be scheduled as several shorter blocks.",
    );
  });

  it("reports nothing when even an overlapping placement cannot end inside a day", () => {
    // 23:30 on the last day of the range, with nothing on the calendar: the
    // day's only boundary starts are in the past.
    const result = findTime(
      input({ context: context({ days: [MONDAY] }), now: at(MONDAY, 1410), durationMinutes: 120 }),
    );
    expect(result.outcome).toBe("nothing");
    expect(result.candidates).toEqual([]);
    expect(result.note).toBe("No time in this range fits 2h.");
  });
});

describe("a deadline in the past", () => {
  it("still searches, marks every slot as after the deadline, and says so", () => {
    const result = findTime(
      input({ task: { id: "task", title: "Essay", dueDate: d("2026-09-04") } }),
    );
    expect(result.outcome).toBe("found");
    expect(result.candidates).toHaveLength(5);
    expect(result.candidates.every((c) => !c.score.beforeDeadline)).toBe(true);
    expect(slots(result)[0]).toEqual([MONDAY, 540, 600]);
    expect(result.note).toBe("The Sep 4 deadline has passed; these times are after it.");
  });

  it("keeps the deadline note alongside the fallback note", () => {
    const result = findTime(
      input({
        task: { id: "task", title: "Essay", dueDate: d("2026-09-04") },
        commitments: WEEK.map((date) => allDay("All day", date)),
      }),
    );
    expect(result.outcome).toBe("fallback-overlaps");
    expect(result.note).toBe(
      "There is no open time in this range; these times overlap existing blocks. The Sep 4 deadline has passed; these times are after it.",
    );
  });
});

describe("a deadline inside the range", () => {
  it("ranks every slot before it above every slot after it", () => {
    const result = findTime(
      input({
        task: { id: "task", title: "Essay", dueDate: TUESDAY },
        limit: 10,
        commitments: WEEK.flatMap(bookedOutsideHours),
      }),
    );
    // Saturday and Sunday have the same open window but no working hours,
    // so they trail the weekdays on the second criterion, not the first.
    expect(slots(result)).toEqual([
      [MONDAY, 540, 600],
      [TUESDAY, 540, 600],
      [WEDNESDAY, 540, 600],
      [THURSDAY, 540, 600],
      [FRIDAY, 540, 600],
      [SATURDAY, 540, 600],
      [SUNDAY, 540, 600],
    ]);
    expect(result.candidates.map((c) => c.score.beforeDeadline)).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(result.candidates.map((c) => c.score.withinWorkingHours)).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
  });
});

describe("DST transitions", () => {
  it("keeps the clock reading, not start plus elapsed, across the spring-forward gap", () => {
    // A 60-minute block starting 01:30 ends at 03:30 on the clock.
    const result = findTime(
      input({
        context: context({
          days: [SPRING_FORWARD],
          today: SPRING_FORWARD,
          workingHours: hours([{ start: t("01:30"), end: t("05:00") }], [0]),
        }),
        now: at(SPRING_FORWARD, 60),
      }),
    );
    const first = result.candidates[0];
    expect(first?.span).toEqual({ date: SPRING_FORWARD, startMinutes: 90, endMinutes: 210 });
    expect(first?.startAt).toBe("2026-03-08T06:30:00.000Z");
    expect(first?.endAt).toBe("2026-03-08T07:30:00.000Z");
    expect(durationMinutes(first!.startAt, first!.endAt)).toBe(60);
    expect(first?.score.withinWorkingHours).toBe(true);
  });

  it("gives a fall-back slot its elapsed length and a span the server resolves identically", () => {
    // 01:00 EDT to 03:00 EST is three elapsed hours and reads 01:00–03:00.
    const result = findTime(
      input({
        durationMinutes: 180,
        context: context({
          days: [FALL_BACK],
          today: FALL_BACK,
          workingHours: hours([{ start: t("01:00"), end: t("05:00") }], [0]),
        }),
        now: at(FALL_BACK, 0),
      }),
    );
    const first = result.candidates[0];
    expect(first?.startAt).toBe("2026-11-01T05:00:00.000Z");
    expect(first?.endAt).toBe("2026-11-01T08:00:00.000Z");
    expect(first?.span).toEqual({ date: FALL_BACK, startMinutes: 60, endMinutes: 180 });
    expect(durationMinutes(first!.startAt, first!.endAt)).toBe(180);
    expect(intervalOfSlot(first!.span, NEW_YORK)).toEqual({
      startAt: first!.startAt,
      endAt: first!.endAt,
    });
  });

  it("does not offer a slot whose wall-clock span the action would resolve to different instants", () => {
    // 01:10 in the *second* pass of the repeated hour. A slot starting 01:15
    // EST reads the same as 01:15 EDT, which is what the action would write,
    // so no candidate may start inside the repeated hour.
    const secondPass = i("2026-11-01T06:10:00.000Z");
    const result = findTime(
      input({
        context: context({
          days: [FALL_BACK],
          today: FALL_BACK,
          workingHours: hours([{ start: t("01:00"), end: t("05:00") }], [0]),
        }),
        now: secondPass,
      }),
    );
    expect(result.outcome).toBe("found");
    for (const c of result.candidates) {
      expect(c.startAt >= "2026-11-01T07:00:00.000Z").toBe(true);
      expect(intervalOfSlot(c.span, NEW_YORK)).toEqual({ startAt: c.startAt, endAt: c.endAt });
    }
    expect(slots(result)[0]).toEqual([FALL_BACK, 420, 480]);
  });

  it("starts a day that has no midnight at its real first instant, and measures it at 23 hours", () => {
    const dayStart = i("2026-09-06T04:00:00.000Z");
    const result = findTime(
      input({
        context: context({
          timezone: SANTIAGO,
          days: [SANTIAGO_SPRING],
          today: SANTIAGO_SPRING,
          workingHours: hours([{ start: t("00:00"), end: t("08:00") }], [0]),
        }),
        now: dayStart,
      }),
    );
    expect(result.outcome).toBe("found");
    expect(result.candidates.every((c) => c.startAt >= dayStart)).toBe(true);
    const first = result.candidates[0];
    expect(first?.span).toEqual({ date: SANTIAGO_SPRING, startMinutes: 60, endMinutes: 120 });
    expect(first?.openWindowMinutes).toBe(1380);
    expect(first?.explanation).toBe("Sunday 1:00–2:00 AM — 23-hour open window.");
    expect(intervalOfSlot(first!.span, SANTIAGO)).toEqual({
      startAt: first!.startAt,
      endAt: first!.endAt,
    });
  });

  it("yields ordinary candidates from an ordinary working window on both transition days", () => {
    for (const date of [SPRING_FORWARD, FALL_BACK]) {
      const result = findTime(
        input({
          context: context({ days: [date], today: date, workingHours: hours([NINE_TO_FIVE], [0]) }),
          now: at(date, 0),
        }),
      );
      const first = result.candidates[0];
      expect(first?.span).toEqual({ date, startMinutes: 540, endMinutes: 600 });
      expect(durationMinutes(first!.startAt, first!.endAt)).toBe(60);
      expect(first?.score.withinWorkingHours).toBe(true);
    }
  });
});

describe("no working hours at all", () => {
  it("still suggests, inside the suggestion window, marked as outside working hours", () => {
    const result = findTime(input({ context: context({ workingHours: NO_HOURS }) }));
    expect(result.outcome).toBe("found");
    expect(slots(result)).toEqual([
      [MONDAY, 420, 480],
      [TUESDAY, 420, 480],
      [WEDNESDAY, 420, 480],
      [THURSDAY, 420, 480],
      [FRIDAY, 420, 480],
    ]);
    expect(result.candidates.every((c) => !c.score.withinWorkingHours)).toBe(true);
    expect(result.candidates[0]?.explanation).toBe(
      "Monday 7:00–8:00 AM — 24-hour open window, outside working hours.",
    );
  });
});

describe("per-day diversity", () => {
  const spread = context({
    workingHours: {
      ...WEEKDAYS_NINE_TO_FIVE,
      1: [
        { start: t("09:00"), end: t("12:00") },
        { start: t("13:00"), end: t("17:00") },
      ],
    },
    focusWindows: [
      { start: t("10:00"), end: t("11:00") },
      { start: t("14:00"), end: t("15:00") },
    ],
  });

  it("holds each day to two picks while other days have openings", () => {
    const result = findTime(input({ context: spread }));
    expect(result.candidates).toHaveLength(5);
    const onMonday = result.candidates.filter((c) => c.span.date === MONDAY);
    expect(onMonday).toHaveLength(PER_DAY_LIMIT);
    expect(slots(result)).toEqual([
      [MONDAY, 600, 660],
      [MONDAY, 840, 900],
      [TUESDAY, 600, 660],
      [TUESDAY, 840, 900],
      [WEDNESDAY, 600, 660],
    ]);
  });

  it("fills up to the limit from one day when it is the only day, in rank order", () => {
    const result = findTime(input({ context: { ...spread, days: [MONDAY] } }));
    expect(slots(result)).toEqual([
      [MONDAY, 600, 660],
      [MONDAY, 840, 900],
      [MONDAY, 540, 600],
      [MONDAY, 780, 840],
      [MONDAY, 420, 480],
    ]);
  });
});

describe("explanations", () => {
  it("matches the spec's example", () => {
    const result = findTime(
      input({
        task: { id: "task", title: "Essay", dueDate: THURSDAY },
        context: context({ workingHours: hours([{ start: t("09:00"), end: t("18:00") }]) }),
        commitments: [
          ...[MONDAY, TUESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY].map((date) =>
            allDay("Busy", date),
          ),
          block("Morning", WEDNESDAY, 0, 960),
          block("Evening", WEDNESDAY, 1080, 1440),
        ],
      }),
    );
    expect(explanations(result)).toEqual([
      "Wednesday 4:00–5:00 PM — 2-hour open window before Thursday deadline.",
    ]);
  });

  it("states the deadline, the hours and the window length as facts", () => {
    const result = findTime(
      input({
        task: { id: "task", title: "Essay", dueDate: FRIDAY },
        commitments: WEEK.map((date) => block("Work", date, 540, 1020)),
      }),
    );
    expect(explanations(result)[0]).toBe(
      "Monday 7:00–8:00 AM — 9-hour open window before Friday deadline, outside working hours.",
    );
  });

  it("says when a slot is after the deadline", () => {
    const result = findTime(
      input({ task: { id: "task", title: "Essay", dueDate: d("2026-09-04") } }),
    );
    expect(explanations(result)[0]).toBe(
      "Monday 9:00–10:00 AM — 24-hour open window after the Sep 4 deadline.",
    );
  });

  it("calls a window that equals the block an exact fit", () => {
    const result = findTime(
      input({
        task: { id: "task", title: "Essay", dueDate: WEDNESDAY },
        snapMinutes: 1,
        context: context({
          days: [WEDNESDAY],
          today: WEDNESDAY,
          workingHours: hours([{ start: t("22:00"), end: t("23:59") }], [3]),
        }),
        now: at(WEDNESDAY, 0),
        commitments: [block("Day", WEDNESDAY, 0, 1379), block("Late", WEDNESDAY, 1439, 1440)],
      }),
    );
    expect(explanations(result)).toEqual([
      "Wednesday 10:59–11:59 PM — exact fit before Wednesday deadline.",
    ]);
  });

  it("names the overlapped blocks in the fallback and writes both meridiems across noon", () => {
    const result = findTime(
      input({
        durationMinutes: 180,
        commitments: WEEK.flatMap((date) => [
          block("Morning", date, 0, 540),
          block("Rest", date, 660, 1440),
        ]),
      }),
    );
    expect(explanations(result)[0]).toBe("Monday 9:00 AM–12:00 PM — overlaps Rest.");

    const twoBlocks = findTime(
      input({
        commitments: [
          block("Tue morning", TUESDAY, 0, 570),
          block("Tue rest", TUESDAY, 570, 1440),
          ...[MONDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY].map((date) =>
            allDay("Busy", date),
          ),
        ],
        context: context({ days: [TUESDAY], today: TUESDAY }),
        now: at(TUESDAY, 0),
      }),
    );
    expect(explanations(twoBlocks)).toContain(
      "Tuesday 9:00–10:00 AM — overlaps Tue morning and Tue rest.",
    );
  });

  it("dates a day beyond the coming seven, and a deadline beyond them", () => {
    const nextWeek = weekOf(d("2026-09-14"), 1).days;
    const result = findTime(
      input({
        task: { id: "task", title: "Essay", dueDate: d("2026-09-18") },
        context: context({ days: nextWeek }),
      }),
    );
    expect(explanations(result)[0]).toBe(
      "Mon Sep 14 9:00–10:00 AM — 24-hour open window before Sep 18 deadline.",
    );
  });

  it("writes a mixed length with the product's duration format and a sub-hour length in minutes", () => {
    const ninety = findTime(
      input({
        context: context({ days: [MONDAY] }),
        commitments: [block("Morning", MONDAY, 0, 600), block("Rest", MONDAY, 690, 1440)],
      }),
    );
    expect(explanations(ninety)).toEqual(["Monday 10:00–11:00 AM — 1h 30m open window."]);

    const fortyFive = findTime(
      input({
        durationMinutes: 30,
        context: context({ days: [MONDAY] }),
        commitments: [block("Morning", MONDAY, 0, 600), block("Rest", MONDAY, 645, 1440)],
      }),
    );
    expect(explanations(fortyFive)).toEqual(["Monday 10:00–10:30 AM — 45-minute open window."]);
  });

  it("mentions a focus window when the slot is in or partly in one", () => {
    const inside = findTime(
      input({
        context: context({
          days: [MONDAY],
          focusWindows: [{ start: t("14:00"), end: t("16:00") }],
        }),
      }),
    );
    expect(explanations(inside)[0]).toBe(
      "Monday 2:00–3:00 PM — 24-hour open window, in a focus window.",
    );

    const partly = findTime(
      input({
        context: context({
          days: [MONDAY],
          focusWindows: [{ start: t("09:30"), end: t("10:30") }],
        }),
      }),
    );
    expect(explanations(partly)[1]).toBe(
      "Monday 9:00–10:00 AM — 24-hour open window, partly in a focus window.",
    );
  });
});

describe("contracts", () => {
  const scenarios: [string, FindTimeInput][] = [
    ["open week", input()],
    ["mid-morning", input({ now: at(MONDAY, 637), snapMinutes: 5 })],
    [
      "fully booked",
      input({ commitments: WEEK.map((date) => allDay("All day", date)), durationMinutes: 90 }),
    ],
    ["longer than any gap", input({ durationMinutes: 1500 })],
    ["past deadline", input({ task: { id: "task", title: "Essay", dueDate: d("2026-09-04") } })],
    [
      "range past",
      input({ context: context({ today: d("2026-09-14") }), now: at(d("2026-09-14"), 0) }),
    ],
    ["empty", input({ context: context({ days: [] }) })],
    [
      "spring forward",
      input({
        context: context({
          days: [SPRING_FORWARD],
          today: SPRING_FORWARD,
          workingHours: hours([{ start: t("01:00"), end: t("05:00") }], [0]),
        }),
        now: at(SPRING_FORWARD, 0),
        durationMinutes: 90,
      }),
    ],
    [
      "fall back",
      input({
        context: context({
          days: [FALL_BACK],
          today: FALL_BACK,
          workingHours: hours([{ start: t("00:00"), end: t("05:00") }], [0]),
        }),
        now: at(FALL_BACK, 0),
        durationMinutes: 45,
        snapMinutes: 5,
      }),
    ],
    [
      "santiago",
      input({
        context: context({
          timezone: SANTIAGO,
          days: [SANTIAGO_SPRING],
          today: SANTIAGO_SPRING,
          workingHours: NO_HOURS,
        }),
        now: i("2026-09-06T04:00:00.000Z"),
      }),
    ],
  ];

  it("resolves every candidate's span through intervalOfSlot to exactly the scored instants", () => {
    for (const [, scenario] of scenarios) {
      const result = findTime(scenario);
      for (const c of result.candidates) {
        expect(intervalOfSlot(c.span, scenario.context.timezone)).toEqual({
          startAt: c.startAt,
          endAt: c.endAt,
        });
        expect(durationMinutes(c.startAt, c.endAt)).toBe(
          Math.max(1, Math.round(scenario.durationMinutes)),
        );
      }
    }
  });

  it("never characterises the user or the week (Domain Rule 7)", () => {
    const banned = /lazy|unproductive|failure|behind|overcommitted|bad|light day|busy day|should/i;
    for (const [, scenario] of scenarios) {
      const result = findTime(scenario);
      for (const text of [...explanations(result), result.note ?? ""]) {
        expect(text).not.toMatch(banned);
      }
    }
  });

  it("returns at most the limit and never a slot before now", () => {
    for (const [, scenario] of scenarios) {
      const result = findTime(scenario);
      expect(result.candidates.length).toBeLessThanOrEqual(
        scenario.limit ?? DEFAULT_FIND_TIME_LIMIT,
      );
      expect(result.candidates.every((c) => c.startAt >= scenario.now)).toBe(true);
    }
  });
});
