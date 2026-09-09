import { describe, expect, it } from "vitest";

import { fromLocal, ianaTimeZone, localDate, localTime } from "../time";
import type { IanaTimeZone, LocalDate, Minutes, TimeWindow, WorkingHours } from "../types";
import { remainingMinutesOf, scheduledMinutesOf, weekCapacity } from "./capacity";
import { dayBounds, intervalMinutes, intervalOfSlot } from "./intervals";
import type { Commitment, PlanningContext, PlanningTask } from "./types";

/**
 *   America/New_York  week of Mon 2026-09-07; today is Wed 2026-09-09
 *                     2026-03-08 spring forward, 2026-11-01 fall back (Sundays)
 *   America/Santiago  2026-09-06 spring forward at midnight (the day starts 01:00)
 */
const NEW_YORK = ianaTimeZone("America/New_York");
const SANTIAGO = ianaTimeZone("America/Santiago");

const d = localDate;
const t = localTime;

const MON = d("2026-09-07");
const TUE = d("2026-09-08");
const WED = d("2026-09-09");
const THU = d("2026-09-10");
const FRI = d("2026-09-11");
const SAT = d("2026-09-12");
const SUN = d("2026-09-13");
const WEEK: readonly LocalDate[] = [MON, TUE, WED, THU, FRI, SAT, SUN];

const NINE_TO_FIVE: TimeWindow = { start: t("09:00"), end: t("17:00") };
const NINE_TO_ONE: TimeWindow = { start: t("09:00"), end: t("13:00") };

/** Mon–Thu 8h, Fri 4h, weekend off: 36h of working time in the week. */
const HOURS: WorkingHours = {
  0: [],
  1: [NINE_TO_FIVE],
  2: [NINE_TO_FIVE],
  3: [NINE_TO_FIVE],
  4: [NINE_TO_FIVE],
  5: [NINE_TO_ONE],
  6: [],
};

function context(overrides: Partial<PlanningContext> = {}): PlanningContext {
  return {
    timezone: NEW_YORK,
    workingHours: HOURS,
    focusWindows: [],
    days: WEEK,
    today: WED,
    ...overrides,
  };
}

function at(date: LocalDate, minutes: Minutes, tz: IanaTimeZone = NEW_YORK) {
  return fromLocal(date, minutes, tz);
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

function event(id: string, date: LocalDate, start: Minutes, end: Minutes): Commitment {
  return commitment({ id, startAt: at(date, start), endAt: at(date, end) });
}

function work(
  id: string,
  taskId: string,
  date: LocalDate,
  start: Minutes,
  end: Minutes,
  overrides: Partial<Commitment> = {},
): Commitment {
  return commitment({
    id,
    kind: "work",
    taskId,
    startAt: at(date, start),
    endAt: at(date, end),
    ...overrides,
  });
}

function task(overrides: Partial<PlanningTask> & Pick<PlanningTask, "id">): PlanningTask {
  return {
    title: overrides.id,
    estimatedMinutes: null,
    dueDate: null,
    scheduledOutsideMinutes: 0,
    ...overrides,
  };
}

function capacityOf(commitments: Commitment[], tasks: PlanningTask[] = [], ctx = context()) {
  return weekCapacity({ context: ctx, commitments, tasks });
}

function dayOf(commitments: Commitment[], date: LocalDate, ctx = context()) {
  const day = capacityOf(commitments, [], ctx).days.find((entry) => entry.date === date);
  if (day === undefined) throw new Error(`${date} is not in the range`);
  return day;
}

describe("scheduledMinutesOf", () => {
  it("adds the task's in-range work blocks to what lies outside the range", () => {
    const essay = task({ id: "essay", scheduledOutsideMinutes: 45 });
    expect(
      scheduledMinutesOf(essay, [
        work("a", "essay", MON, 540, 600),
        work("b", "essay", THU, 600, 690),
        work("other", "reading", TUE, 540, 600),
        event("standup", TUE, 540, 555),
      ]),
    ).toBe(45 + 60 + 90);
  });

  it("counts every block of the task, executed or settled: coverage is planned time", () => {
    const essay = task({ id: "essay" });
    expect(
      scheduledMinutesOf(essay, [
        work("done", "essay", MON, 540, 600, { completedAt: at(MON, 600) }),
        work("settled", "essay", THU, 540, 600, { taskCompletedAt: at(MON, 0) }),
      ]),
    ).toBe(120);
  });

  it("is zero with nothing scheduled anywhere", () => {
    expect(scheduledMinutesOf(task({ id: "essay" }), [])).toBe(0);
  });
});

describe("remainingMinutesOf", () => {
  it("is the estimate less what is scheduled", () => {
    const essay = task({ id: "essay", estimatedMinutes: 135, scheduledOutsideMinutes: 30 });
    expect(remainingMinutesOf(essay, [work("a", "essay", MON, 540, 585)])).toBe(60);
  });

  it("is zero for an unestimated task, however much is booked", () => {
    expect(remainingMinutesOf(task({ id: "a" }), [work("x", "a", MON, 540, 600)])).toBe(0);
    expect(remainingMinutesOf(task({ id: "b", estimatedMinutes: 0 }), [])).toBe(0);
    expect(remainingMinutesOf(task({ id: "c", estimatedMinutes: -30 }), [])).toBe(0);
  });

  it("floors at zero when more is booked than estimated", () => {
    const essay = task({ id: "essay", estimatedMinutes: 60 });
    expect(remainingMinutesOf(essay, [work("a", "essay", MON, 540, 660)])).toBe(0);
  });
});

describe("per-day workload", () => {
  it("sums planned block by block while available subtracts merged coverage", () => {
    const day = dayOf([event("meeting", WED, 540, 660), work("essay", "t", WED, 600, 720)], WED);
    expect(day.plannedMinutes).toBe(240);
    expect(day.eventMinutes).toBe(120);
    expect(day.workMinutes).toBe(120);
    expect(day.workingMinutes).toBe(480);
    expect(day.availableMinutes).toBe(300);
  });

  it("splits a midnight-crossing block across two days by elapsed clip", () => {
    const late = commitment({ id: "late", startAt: at(MON, 1410), endAt: at(TUE, 30) });
    expect(dayOf([late], MON).plannedMinutes).toBe(30);
    expect(dayOf([late], TUE).plannedMinutes).toBe(30);
    expect(dayOf([late], WED).plannedMinutes).toBe(0);
  });

  it("counts habit blocks as work and does not subtract time outside the working window", () => {
    const day = dayOf(
      [commitment({ id: "run", kind: "habit", startAt: at(WED, 420), endAt: at(WED, 480) })],
      WED,
    );
    expect(day.workMinutes).toBe(60);
    expect(day.eventMinutes).toBe(0);
    expect(day.availableMinutes).toBe(480);
  });

  it("treats an unexecuted block of a completed task as free time (Domain Rule 13)", () => {
    const settled = work("settled", "t", WED, 540, 600, { taskCompletedAt: at(MON, 0) });
    const day = dayOf([settled], WED);
    expect(day.plannedMinutes).toBe(0);
    expect(day.availableMinutes).toBe(480);
  });

  it("counts an executed block in both planned and busy", () => {
    const spent = work("spent", "t", WED, 540, 600, {
      completedAt: at(WED, 600),
      taskCompletedAt: at(WED, 600),
    });
    const day = dayOf([spent], WED);
    expect(day.plannedMinutes).toBe(60);
    expect(day.availableMinutes).toBe(420);
  });

  it("counts an all-day item in neither", () => {
    const birthday = commitment({
      id: "bday",
      allDay: true,
      startAt: at(WED, 0),
      endAt: at(THU, 0),
    });
    const day = dayOf([birthday], WED);
    expect(day.plannedMinutes).toBe(0);
    expect(day.availableMinutes).toBe(480);
  });

  it("gives a day off no working or available minutes but still shows its planned time", () => {
    const day = dayOf([event("errand", SAT, 600, 690)], SAT);
    expect(day.workingMinutes).toBe(0);
    expect(day.availableMinutes).toBe(0);
    expect(day.plannedMinutes).toBe(90);
    expect(day.weekday).toBe(6);
  });

  it("never lets a day's available time go negative or exceed its window", () => {
    const day = dayOf([event("marathon", WED, 0, 1440)], WED);
    expect(day.plannedMinutes).toBe(1440);
    expect(day.availableMinutes).toBe(0);
  });

  it("marks days before today as past and carries the weekday", () => {
    const { days } = capacityOf([]);
    expect(days.map((day) => day.date)).toEqual(WEEK);
    expect(days.map((day) => day.isPast)).toEqual([true, true, false, false, false, false, false]);
    expect(days.map((day) => day.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });
});

describe("week totals", () => {
  it("excludes past days from available but keeps them in planned and working", () => {
    const capacity = capacityOf([event("mon", MON, 540, 660), event("thu", THU, 540, 600)]);
    expect(capacity.plannedMinutes).toBe(180);
    expect(capacity.workingMinutes).toBe(4 * 480 + 240);
    // Wed 480 + Thu 420 + Fri 240.
    expect(capacity.availableMinutes).toBe(480 + 420 + 240);
  });

  it("counts today in full, whatever the hour", () => {
    expect(capacityOf([], [], context({ today: FRI })).availableMinutes).toBe(240);
    expect(capacityOf([], [], context({ today: SUN })).availableMinutes).toBe(0);
    expect(capacityOf([], [], context({ today: d("2026-09-14") })).availableMinutes).toBe(0);
  });

  it("counts every day as open when the range is in the future", () => {
    expect(capacityOf([], [], context({ today: d("2026-09-01") })).availableMinutes).toBe(2160);
  });

  it("is all zeros over an empty range", () => {
    expect(capacityOf([], [], context({ days: [] }))).toEqual({
      plannedMinutes: 0,
      availableMinutes: 0,
      unscheduledMinutes: 0,
      workingMinutes: 0,
      days: [],
    });
  });
});

describe("unscheduled work", () => {
  it("sums each task's remainder from its outside minutes and in-range work blocks", () => {
    const capacity = capacityOf(
      [work("a", "essay", MON, 540, 600), work("b", "reading", THU, 540, 570)],
      [
        task({ id: "essay", estimatedMinutes: 135, scheduledOutsideMinutes: 15 }),
        task({ id: "reading", estimatedMinutes: 60 }),
        task({ id: "slides", estimatedMinutes: 90 }),
      ],
    );
    expect(capacity.unscheduledMinutes).toBe(60 + 30 + 90);
  });

  it("counts a task once however many sections list it", () => {
    const essay = task({ id: "essay", estimatedMinutes: 120 });
    expect(capacityOf([], [essay, essay, { ...essay }]).unscheduledMinutes).toBe(120);
  });

  it("contributes nothing for an unestimated or over-scheduled task", () => {
    const capacity = capacityOf(
      [work("a", "over", MON, 540, 720)],
      [task({ id: "none" }), task({ id: "over", estimatedMinutes: 60 })],
    );
    expect(capacity.unscheduledMinutes).toBe(0);
  });

  it("does not count settled or executed blocks differently: coverage is planned time", () => {
    const capacity = capacityOf(
      [work("done", "essay", MON, 540, 600, { completedAt: at(MON, 600) })],
      [task({ id: "essay", estimatedMinutes: 90 })],
    );
    expect(capacity.unscheduledMinutes).toBe(30);
  });
});

describe("DST fixture days", () => {
  const earlyWindow: TimeWindow = { start: t("01:00"), end: t("04:00") };
  const sundayHours: WorkingHours = { ...HOURS, 0: [earlyWindow] };

  it("measures a 01:00–04:00 window as 120 elapsed minutes across a spring-forward gap", () => {
    const spring = d("2026-03-08");
    const day = dayOf(
      [],
      spring,
      context({ workingHours: sundayHours, days: [spring], today: spring }),
    );
    expect(day.workingMinutes).toBe(120);
    expect(day.availableMinutes).toBe(120);
  });

  it("measures the same window as 240 across a fall-back overlap", () => {
    const fall = d("2026-11-01");
    const day = dayOf([], fall, context({ workingHours: sundayHours, days: [fall], today: fall }));
    expect(day.workingMinutes).toBe(240);
    expect(day.availableMinutes).toBe(240);
  });

  it("charges a block across the transition what the clock actually ran", () => {
    const spring = d("2026-03-08");
    const ctx = context({ workingHours: sundayHours, days: [spring], today: spring });
    const block = commitment({ id: "early", startAt: at(spring, 60), endAt: at(spring, 240) });
    const day = dayOf([block], spring, ctx);
    expect(day.plannedMinutes).toBe(120);
    expect(day.availableMinutes).toBe(0);
  });

  it("clips a block written for a Santiago morning whose midnight does not exist", () => {
    const before = d("2026-09-05");
    const transition = d("2026-09-06");
    expect(intervalMinutes(dayBounds(transition, SANTIAGO))).toBe(1380);

    const ctx = context({ timezone: SANTIAGO, days: [before, transition], today: before });
    // 00:00–02:00 drawn on the transition day is one elapsed hour, all of it that day's.
    const morning = commitment({
      id: "morning",
      ...intervalOfSlot({ date: transition, startMinutes: 0, endMinutes: 120 }, SANTIAGO),
    });
    expect(dayOf([morning], before, ctx).plannedMinutes).toBe(0);
    expect(dayOf([morning], transition, ctx).plannedMinutes).toBe(60);

    // 23:00 Saturday to 02:00 Sunday: two elapsed hours, one each side of the 01:00 boundary.
    const overnight = commitment({
      id: "overnight",
      startAt: at(before, 1380, SANTIAGO),
      endAt: at(transition, 120, SANTIAGO),
    });
    expect(intervalMinutes(overnight)).toBe(120);
    expect(dayOf([overnight], before, ctx).plannedMinutes).toBe(60);
    expect(dayOf([overnight], transition, ctx).plannedMinutes).toBe(60);
  });
});
