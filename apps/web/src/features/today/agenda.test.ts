import { describe, expect, it } from "vitest";

import { ianaTimeZone, localDate } from "@momentum/core/time";

import {
  AT_RISK_OVERDUE_LIMIT,
  buildRisks,
  buildTimeline,
  completedBlockCount,
  dayPartOf,
  habitsForToday,
  isSettled,
  nextUpReasonFor,
  selectNextUp,
  timelineStateOf,
} from "@/features/today/agenda";
import {
  TODAY,
  WEEK,
  at,
  completion,
  eventItem,
  habit,
  habitItem,
  timelineOf,
  todayPage,
  todayTask,
  workItem,
} from "@/features/today/fixtures";
import type { OverlapWarning, InsufficientTimeWarning } from "@/features/today/types";

/**
 * The Today page's domain logic.
 *
 * Every function here takes `now` as a parameter, so the whole suite pins the
 * clock rather than mocking one — which is also the property that makes the
 * server render and the hydrated client render provably identical.
 */

describe("dayPartOf", () => {
  it("changes at noon and at six", () => {
    expect(dayPartOf(0)).toBe("morning");
    expect(dayPartOf(11 * 60 + 59)).toBe("morning");
    expect(dayPartOf(12 * 60)).toBe("afternoon");
    expect(dayPartOf(17 * 60 + 59)).toBe("afternoon");
    expect(dayPartOf(18 * 60)).toBe("evening");
    expect(dayPartOf(23 * 60 + 59)).toBe("evening");
  });
});

describe("buildTimeline", () => {
  it("places each block by its wall-clock reading on today, in order", () => {
    const timeline = timelineOf([
      workItem({ id: "b", startAt: at("2026-09-08", 14), endAt: at("2026-09-08", 15) }),
      eventItem({ id: "a", startAt: at("2026-09-08", 9), endAt: at("2026-09-08", 10, 30) }),
    ]);

    expect(timeline.map((entry) => entry.item.id)).toEqual(["a", "b"]);
    expect(timeline[0]).toMatchObject({ startMinutes: 540, endMinutes: 630, durationMinutes: 90 });
    expect(timeline[1]).toMatchObject({ startMinutes: 840, endMinutes: 900 });
  });

  it("drops a block that touches no part of today", () => {
    const timeline = timelineOf([
      eventItem({ id: "tomorrow", startAt: at("2026-09-09", 9), endAt: at("2026-09-09", 10) }),
    ]);
    expect(timeline).toEqual([]);
  });

  it("clips a block that began yesterday and marks it as continuing", () => {
    const [entry] = timelineOf([
      eventItem({ id: "night", startAt: at("2026-09-07", 23), endAt: at("2026-09-08", 1) }),
    ]);

    expect(entry).toMatchObject({
      startMinutes: 0,
      endMinutes: 60,
      startsBeforeToday: true,
      endsAfterToday: false,
      // The elapsed length of the *whole* block, not of today's slice.
      durationMinutes: 120,
    });
  });

  it("clips a block that runs into tomorrow at the bottom of the day, not at zero", () => {
    const [entry] = timelineOf([
      eventItem({ id: "late", startAt: at("2026-09-08", 23, 30), endAt: at("2026-09-09", 0, 30) }),
    ]);

    expect(entry).toMatchObject({ startMinutes: 1410, endMinutes: 1440, endsAfterToday: true });
  });

  it("puts all-day items first and gives them the whole column", () => {
    const timeline = timelineOf([
      eventItem({ id: "timed", startAt: at("2026-09-08", 0, 30), endAt: at("2026-09-08", 1) }),
      eventItem({
        id: "allday",
        allDay: true,
        startAt: at("2026-09-08", 0),
        endAt: at("2026-09-09", 0),
      }),
    ]);

    expect(timeline.map((entry) => entry.item.id)).toEqual(["allday", "timed"]);
    expect(timeline[0]).toMatchObject({ startMinutes: 0, endMinutes: 1440 });
  });

  /**
   * The defect Phases 3 and 4 each found once, from the other direction: on a
   * fall-back day 01:00–03:00 is *three* elapsed hours but still ends at 03:00
   * on the clock. The row's placement is wall clock; its duration is elapsed.
   */
  it("keeps wall clock and elapsed time apart across a fall-back transition", () => {
    const tz = ianaTimeZone("America/New_York");
    const day = localDate("2026-11-01");
    const timeline = buildTimeline(
      [
        {
          item: eventItem({
            id: "dst",
            startAt: at("2026-11-01", 1, 0, tz),
            endAt: at("2026-11-01", 3, 0, tz),
          }),
          project: null,
        },
      ],
      day,
      tz,
    );

    expect(timeline[0]).toMatchObject({ startMinutes: 60, endMinutes: 180 });
    expect(timeline[0]?.durationMinutes).toBe(180);
  });

  it("orders equal starts by end and then by id, so the list never reshuffles", () => {
    const timeline = timelineOf([
      eventItem({ id: "c", startAt: at("2026-09-08", 9), endAt: at("2026-09-08", 10) }),
      eventItem({ id: "a", startAt: at("2026-09-08", 9), endAt: at("2026-09-08", 10) }),
      eventItem({ id: "b", startAt: at("2026-09-08", 9), endAt: at("2026-09-08", 9, 30) }),
    ]);

    expect(timeline.map((entry) => entry.item.id)).toEqual(["b", "a", "c"]);
  });
});

describe("timelineStateOf", () => {
  const [entry] = timelineOf([
    eventItem({ id: "e", startAt: at("2026-09-08", 9), endAt: at("2026-09-08", 10) }),
  ]);

  it("is future before it starts, current while it runs, past once it has ended", () => {
    expect(entry && timelineStateOf(entry, at("2026-09-08", 8, 59))).toBe("future");
    expect(entry && timelineStateOf(entry, at("2026-09-08", 9))).toBe("current");
    expect(entry && timelineStateOf(entry, at("2026-09-08", 9, 59))).toBe("current");
    // Half-open, like every window in this codebase: a block ending at 10:00 is
    // past at 10:00, not still running.
    expect(entry && timelineStateOf(entry, at("2026-09-08", 10))).toBe("past");
  });
});

describe("isSettled (Domain Rule 13)", () => {
  it("is true for a completed block", () => {
    const [entry] = timelineOf([workItem({ id: "b", completedAt: at("2026-09-08", 9, 30) })]);
    expect(entry && isSettled(entry)).toBe(true);
  });

  it("is true for an incomplete block whose task was completed elsewhere", () => {
    const item = workItem({ id: "b" });
    const [entry] = timelineOf([
      { ...item, work: { ...item.work!, taskCompletedAt: at("2026-09-08", 8) } },
    ]);
    expect(entry && isSettled(entry)).toBe(true);
  });

  it("is false for an ordinary outstanding block", () => {
    const [entry] = timelineOf([workItem({ id: "b" })]);
    expect(entry && isSettled(entry)).toBe(false);
  });
});

describe("selectNextUp", () => {
  const morning = workItem({
    id: "morning",
    startAt: at("2026-09-08", 9),
    endAt: at("2026-09-08", 10),
  });
  const afternoon = workItem({
    id: "afternoon",
    startAt: at("2026-09-08", 14),
    endAt: at("2026-09-08", 15),
  });

  it("picks the next incomplete scheduled item by the current time", () => {
    const page = todayPage({ timeline: timelineOf([morning, afternoon]) });
    const next = selectNextUp(page, at("2026-09-08", 10, 30));

    expect(next).toMatchObject({ kind: "block", inProgress: false });
    expect(next.kind === "block" && next.entry.item.id).toBe("afternoon");
  });

  it("names the running block, and says it is in progress (the mid-block state)", () => {
    const page = todayPage({ timeline: timelineOf([morning, afternoon]) });
    const next = selectNextUp(page, at("2026-09-08", 9, 20));

    expect(next).toMatchObject({ kind: "block", inProgress: true });
    expect(next.kind === "block" && next.entry.item.id).toBe("morning");
  });

  it("skips a completed block and a block whose task is already done", () => {
    const settled = workItem({
      id: "settled",
      startAt: at("2026-09-08", 11),
      endAt: at("2026-09-08", 12),
    });
    const page = todayPage({
      timeline: timelineOf([
        { ...settled, work: { ...settled.work!, taskCompletedAt: at("2026-09-08", 8) } },
        { ...morning, completedAt: at("2026-09-08", 9, 45) },
        afternoon,
      ]),
    });

    const next = selectNextUp(page, at("2026-09-08", 8));
    expect(next.kind === "block" && next.entry.item.id).toBe("afternoon");
  });

  it("never offers an item that has already ended, however incomplete", () => {
    const page = todayPage({ timeline: timelineOf([morning]) });
    expect(selectNextUp(page, at("2026-09-08", 18)).kind).not.toBe("block");
  });

  it("never offers an all-day item: it names no time to start at", () => {
    const page = todayPage({
      timeline: timelineOf([
        eventItem({
          id: "allday",
          allDay: true,
          startAt: at("2026-09-08", 0),
          endAt: at("2026-09-09", 0),
        }),
      ]),
    });
    expect(selectNextUp(page, at("2026-09-08", 10)).kind).toBe("empty");
  });

  it("falls back to what is due soonest when nothing is scheduled", () => {
    const page = todayPage({
      candidates: [
        todayTask({ id: "overdue", title: "Lab report", dueDate: localDate("2026-09-05") }),
        todayTask({ id: "today", title: "Problem set" }),
      ],
    });

    const next = selectNextUp(page, at("2026-09-08", 10));
    expect(next).toMatchObject({ kind: "task", reason: "overdue" });
    expect(next.kind === "task" && next.task.id).toBe("overdue");
  });

  it("skips a candidate the overlay has already completed", () => {
    const page = todayPage({
      candidates: [
        todayTask({ id: "done", completedAt: at("2026-09-08", 9) }),
        todayTask({ id: "open", title: "Problem set" }),
      ],
    });
    const next = selectNextUp(page, at("2026-09-08", 10));
    expect(next.kind === "task" && next.task.id).toBe("open");
  });

  it("reports the everything-done state with what the day added up to", () => {
    const page = todayPage({
      timeline: timelineOf([{ ...morning, completedAt: at("2026-09-08", 9, 45) }]),
      completedTasksToday: 2,
    });

    expect(selectNextUp(page, at("2026-09-08", 18))).toEqual({ kind: "done", completed: 3 });
  });

  it("reports an open day when the day held nothing at all", () => {
    expect(selectNextUp(todayPage(), at("2026-09-08", 10))).toEqual({ kind: "empty" });
  });
});

describe("nextUpReasonFor", () => {
  it("reads the deadline against today", () => {
    expect(nextUpReasonFor(todayTask({ id: "a", dueDate: localDate("2026-09-07") }), TODAY)).toBe(
      "overdue",
    );
    expect(nextUpReasonFor(todayTask({ id: "b", dueDate: TODAY }), TODAY)).toBe("due-today");
    expect(nextUpReasonFor(todayTask({ id: "c", dueDate: localDate("2026-09-12") }), TODAY)).toBe(
      "due-soon",
    );
    expect(nextUpReasonFor(todayTask({ id: "d", dueDate: null }), TODAY)).toBe("undated");
  });
});

describe("completedBlockCount", () => {
  it("counts the blocks marked done, not the ones that merely ended", () => {
    const timeline = timelineOf([
      workItem({ id: "a", completedAt: at("2026-09-08", 9, 45) }),
      workItem({ id: "b", startAt: at("2026-09-08", 14), endAt: at("2026-09-08", 15) }),
    ]);
    expect(completedBlockCount(timeline)).toBe(1);
  });
});

describe("buildRisks", () => {
  const overlap: OverlapWarning = {
    kind: "overlap",
    date: TODAY,
    first: { id: "a", title: "Chemistry lecture" },
    second: { id: "b", title: "Study group" },
    overlapMinutes: 30,
  };

  const shortfall: InsufficientTimeWarning = {
    kind: "insufficient-time",
    taskId: "task-lab",
    title: "Lab report",
    dueDate: TODAY,
    remainingMinutes: 180,
    availableMinutes: 60,
  };

  it("is empty when nothing is at risk, so the section is not rendered at all", () => {
    expect(buildRisks(todayPage())).toEqual([]);
  });

  it("lists overdue tasks first, then the engine's warnings", () => {
    const page = todayPage({
      overdue: [todayTask({ id: "t1", title: "Essay", dueDate: localDate("2026-09-05") })],
      warnings: [overlap, shortfall],
    });

    expect(buildRisks(page).map((risk) => risk.kind)).toEqual([
      "overdue",
      "insufficient-time",
      "overlap",
    ]);
  });

  it("counts how long a deadline has been past", () => {
    const page = todayPage({
      overdue: [todayTask({ id: "t1", dueDate: localDate("2026-09-07") })],
    });
    expect(buildRisks(page)[0]).toMatchObject({ kind: "overdue", daysOverdue: 1 });
  });

  it("drops an overdue row the overlay has completed, in the same frame", () => {
    const page = todayPage({
      overdue: [
        todayTask({
          id: "t1",
          dueDate: localDate("2026-09-05"),
          completedAt: at("2026-09-08", 10),
        }),
      ],
    });
    expect(buildRisks(page)).toEqual([]);
  });

  it("drops a shortfall once its task is complete, wherever it was completed from", () => {
    const item = workItem({ id: "b", taskId: "task-lab" });
    const page = todayPage({
      warnings: [shortfall],
      timeline: timelineOf([
        { ...item, work: { ...item.work!, taskCompletedAt: at("2026-09-08", 10) } },
      ]),
    });
    expect(buildRisks(page)).toEqual([]);
  });

  it("drops an overlap once either block is done, because a done block occupies no time", () => {
    const page = todayPage({
      warnings: [overlap],
      timeline: timelineOf([
        habitItem({ id: "a", completedAt: at("2026-09-08", 9, 30) }),
        eventItem({ id: "b" }),
      ]),
    });
    expect(buildRisks(page)).toEqual([]);
  });

  it("keeps every overdue row; the cap is the panel's, not the model's", () => {
    const page = todayPage({
      overdue: Array.from({ length: AT_RISK_OVERDUE_LIMIT + 4 }, (_, index) =>
        todayTask({ id: `t${index}`, dueDate: localDate("2026-09-01") }),
      ),
    });
    expect(buildRisks(page)).toHaveLength(AT_RISK_OVERDUE_LIMIT + 4);
  });
});

describe("habitsForToday", () => {
  it("shows a per-day habit only on the days its schedule names", () => {
    // 2026-09-08 is a Tuesday; this habit names Monday and Wednesday.
    const monWed = habit({ id: "h1", frequencyType: "weekdays", activeDays: [1, 3] });
    const daily = habit({ id: "h2", frequencyType: "daily" });

    const rows = habitsForToday([monWed, daily], [], WEEK, TODAY);
    expect(rows.map((row) => row.habit.id)).toEqual(["h2"]);
  });

  /**
   * "Three times a week, any days" names no day, so it asks something of today
   * in the only sense that matters: today is a day it could be done on.
   * `isScheduledOn` answers no for it, and using that answer here would hide
   * the habit for the whole week.
   */
  it("shows a per-week habit every day until its week is met, then stops", () => {
    const thrice = habit({ id: "h3", frequencyType: "times_per_week", target: 3 });

    expect(habitsForToday([thrice], [], WEEK, TODAY)).toHaveLength(1);

    const met = WEEK.slice(0, 3).map((date) => completion("h3", date));
    expect(habitsForToday([thrice], met, WEEK, TODAY)).toEqual([]);
  });

  it("reads today's own amount onto the row, and the week onto its progress", () => {
    const meditate = habit({
      id: "h4",
      frequencyType: "amount_per_day",
      target: 20,
      unit: "minutes",
    });

    const [row] = habitsForToday(
      [meditate],
      [completion("h4", localDate("2026-09-07"), 20), completion("h4", TODAY, 5)],
      WEEK,
      TODAY,
    );

    expect(row?.day).toMatchObject({ amount: 5, target: 20, state: "partial" });
    expect(row?.progress.achieved).toBe(25);
  });

  it("leaves archived habits out: they are not being kept", () => {
    const archived = habit({ id: "h5", archivedAt: at("2026-08-01", 12) });
    expect(habitsForToday([archived], [], WEEK, TODAY)).toEqual([]);
  });
});

/**
 * Domain Rule 1: a due date is a deadline and a work block is intent, and Next
 * Up must not confuse them. A task due today that has time reserved for
 * *another* day is still what is due soonest when today holds nothing left.
 */
describe("selectNextUp and Domain Rule 1", () => {
  it("offers a task due today even though it is scheduled on another day", () => {
    const page = todayPage({
      candidates: [
        todayTask({ id: "t1", title: "Problem set", dueDate: TODAY, scheduledMinutes: 120 }),
      ],
    });

    const next = selectNextUp(page, at("2026-09-08", 19));
    expect(next).toMatchObject({ kind: "task", reason: "due-today" });
    expect(next.kind === "task" && next.task.id).toBe("t1");
  });
});
