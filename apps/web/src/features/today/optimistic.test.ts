import { describe, expect, it } from "vitest";

import { habitDay, weekProgress } from "@momentum/core/habits";
import { localDate } from "@momentum/core/time";

import { applyTodayPatch } from "@/features/today/optimistic";
import {
  TODAY,
  WEEK,
  at,
  completion,
  eventItem,
  habit,
  habitItem,
  timelineOf,
  todayHabit,
  todayPage,
  todayTask,
  workItem,
} from "@/features/today/fixtures";

/**
 * The optimistic overlay.
 *
 * Every case here asks the same question: does the overlay predict what the
 * server will conclude? It patches facts and re-derives the rest, so the
 * assertions are about the derived values as much as about the patched ones —
 * a reducer that set `completedAt` but left the task's blocks unsettled would
 * pass a shallower test and diverge from the reconciled render.
 *
 * Nothing here tests a revert. There is none to test: on failure the transition
 * settles against unchanged props and React discards the overlay, which is what
 * makes Domain Rule 11 structural rather than promised. What the suite proves
 * instead is that every reducer is pure — the input page is never mutated — so
 * the props React falls back to are still the server's.
 */

const NOW = at("2026-09-08", 10, 30);

describe("block completion", () => {
  it("marks the block, and does not touch any other", () => {
    const page = todayPage({
      timeline: timelineOf([
        workItem({ id: "a" }),
        workItem({ id: "b", startAt: at("2026-09-08", 14), endAt: at("2026-09-08", 15) }),
      ]),
    });

    const next = applyTodayPatch(page, {
      kind: "block-completion",
      itemId: "a",
      completed: true,
      alsoTask: false,
      habit: null,
      now: NOW,
    });

    expect(next.timeline[0]?.item.completedAt).toBe(NOW);
    expect(next.timeline[1]?.item.completedAt).toBeNull();
    // Purity: the page React would roll back to is untouched.
    expect(page.timeline[0]?.item.completedAt).toBeNull();
  });

  it("settles every block of the task when the control also completes it", () => {
    const page = todayPage({
      timeline: timelineOf([
        workItem({ id: "a", taskId: "task-1" }),
        workItem({
          id: "b",
          taskId: "task-1",
          startAt: at("2026-09-08", 14),
          endAt: at("2026-09-08", 15),
        }),
      ]),
      tasks: [todayTask({ id: "task-1" })],
    });

    const next = applyTodayPatch(page, {
      kind: "block-completion",
      itemId: "a",
      completed: true,
      alsoTask: true,
      habit: null,
      now: NOW,
    });

    expect(next.timeline[0]?.item.work?.taskCompletedAt).toBe(NOW);
    // Domain Rule 13: the other block stays outstanding on the calendar, and is
    // settled only in the sense that its task is done.
    expect(next.timeline[1]?.item.completedAt).toBeNull();
    expect(next.timeline[1]?.item.work?.taskCompletedAt).toBe(NOW);
    expect(next.tasks[0]?.completedAt).toBe(NOW);
  });

  it("records the habit's day when the block is a habit block", () => {
    const piano = habit({ id: "habit-1" });
    const page = todayPage({
      timeline: timelineOf([habitItem({ id: "a" })]),
      habits: [todayHabit({ habit: piano })],
    });

    const next = applyTodayPatch(page, {
      kind: "block-completion",
      itemId: "a",
      completed: true,
      alsoTask: false,
      habit: { id: "habit-1", date: TODAY, amount: 1 },
      now: NOW,
    });

    expect(next.timeline[0]?.item.completedAt).toBe(NOW);
    expect(next.habits[0]?.day.state).toBe("met");
    expect(next.habits[0]?.completions).toHaveLength(1);
  });

  it("un-completing clears the stamp and reopens the task it closed", () => {
    const item = workItem({ id: "a", completedAt: at("2026-09-08", 9) });
    const page = todayPage({
      timeline: timelineOf([
        { ...item, work: { ...item.work!, taskCompletedAt: at("2026-09-08", 9) } },
      ]),
      tasks: [todayTask({ id: "task-a", completedAt: at("2026-09-08", 9) })],
    });

    const next = applyTodayPatch(page, {
      kind: "block-completion",
      itemId: "a",
      completed: false,
      alsoTask: true,
      habit: null,
      now: NOW,
    });

    expect(next.timeline[0]?.item.completedAt).toBeNull();
    expect(next.timeline[0]?.item.work?.taskCompletedAt).toBeNull();
    expect(next.tasks[0]?.completedAt).toBeNull();
  });
});

describe("task completion", () => {
  it("marks the task in every list it appears in", () => {
    const page = todayPage({
      tasks: [todayTask({ id: "t1" })],
      overdue: [todayTask({ id: "t1" })],
      candidates: [todayTask({ id: "t1" }), todayTask({ id: "t2" })],
    });

    const next = applyTodayPatch(page, {
      kind: "task-completion",
      taskId: "t1",
      completed: true,
      now: NOW,
    });

    expect(next.tasks[0]?.completedAt).toBe(NOW);
    expect(next.overdue[0]?.completedAt).toBe(NOW);
    expect(next.candidates[0]?.completedAt).toBe(NOW);
    expect(next.candidates[1]?.completedAt).toBeNull();
  });

  /**
   * Domain Rule 13: completing a task from anywhere other than a block
   * completes the task and leaves its blocks untouched. They settle, because a
   * block whose task is done renders as settled — but nothing was executed and
   * nothing says it was.
   */
  it("settles the task's blocks without claiming any of them ran", () => {
    const page = todayPage({
      timeline: timelineOf([workItem({ id: "a", taskId: "t1" })]),
      tasks: [todayTask({ id: "t1" })],
    });

    const next = applyTodayPatch(page, {
      kind: "task-completion",
      taskId: "t1",
      completed: true,
      now: NOW,
    });

    expect(next.timeline[0]?.item.completedAt).toBeNull();
    expect(next.timeline[0]?.item.work?.taskCompletedAt).toBe(NOW);
  });
});

describe("habit day", () => {
  it("re-derives the day and the week from the patched completions", () => {
    const reading = habit({ id: "habit-1", name: "Reading", frequencyType: "daily" });
    const page = todayPage({
      habits: [
        todayHabit({
          habit: reading,
          completions: [completion("habit-1", localDate("2026-09-07"))],
          day: habitDay(reading, TODAY, 0, TODAY),
          progress: weekProgress(reading, WEEK, [completion("habit-1", localDate("2026-09-07"))]),
        }),
      ],
    });

    const next = applyTodayPatch(page, {
      kind: "habit-day",
      habitId: "habit-1",
      date: TODAY,
      recorded: true,
      amount: 1,
    });

    expect(next.habits[0]?.day.state).toBe("met");
    expect(next.habits[0]?.progress.achieved).toBe(2);
    expect(page.habits[0]?.progress.achieved).toBe(1);
  });

  it("accumulates an amount habit rather than replacing its total", () => {
    const meditate = habit({
      id: "habit-2",
      name: "Meditate",
      frequencyType: "amount_per_day",
      target: 20,
      unit: "minutes",
    });
    const page = todayPage({
      habits: [
        todayHabit({
          habit: meditate,
          completions: [completion("habit-2", TODAY, 5)],
          day: habitDay(meditate, TODAY, 5, TODAY),
        }),
      ],
    });

    const next = applyTodayPatch(page, {
      kind: "habit-day",
      habitId: "habit-2",
      date: TODAY,
      recorded: true,
      amount: 15,
    });

    expect(next.habits[0]?.day).toMatchObject({ amount: 20, state: "met" });
  });

  it("removing a day deletes the row, which is what the database does", () => {
    const reading = habit({ id: "habit-1" });
    const page = todayPage({
      habits: [todayHabit({ habit: reading, completions: [completion("habit-1", TODAY, 1)] })],
    });

    const next = applyTodayPatch(page, {
      kind: "habit-day",
      habitId: "habit-1",
      date: TODAY,
      recorded: false,
      amount: 1,
    });

    expect(next.habits[0]?.completions).toEqual([]);
  });
});

describe("reschedule", () => {
  it("moves the row and re-sorts the timeline in the same pass", () => {
    const page = todayPage({
      timeline: timelineOf([
        eventItem({ id: "a", startAt: at("2026-09-08", 9), endAt: at("2026-09-08", 10) }),
        eventItem({ id: "b", startAt: at("2026-09-08", 11), endAt: at("2026-09-08", 12) }),
      ]),
    });

    const next = applyTodayPatch(page, {
      kind: "reschedule",
      itemId: "a",
      startAt: at("2026-09-08", 16),
      endAt: at("2026-09-08", 17),
    });

    expect(next.timeline.map((entry) => entry.item.id)).toEqual(["b", "a"]);
    expect(next.timeline[1]).toMatchObject({ startMinutes: 960, endMinutes: 1020 });
  });

  it("drops a block moved off today, because it is no longer today's", () => {
    const page = todayPage({ timeline: timelineOf([eventItem({ id: "a" })]) });

    const next = applyTodayPatch(page, {
      kind: "reschedule",
      itemId: "a",
      startAt: at("2026-09-10", 9),
      endAt: at("2026-09-10", 10),
    });

    expect(next.timeline).toEqual([]);
  });
});
