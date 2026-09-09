import { describe, expect, it } from "vitest";

import { analyticsPeriod } from "./period";
import { summariseAnalytics, type AnalyticsInput } from "./summary";
import {
  block,
  completion,
  d,
  dailyHabit,
  NEW_YORK,
  session,
  task,
  weeklyHabit,
} from "./test-fixtures";

const period = analyticsPeriod("7", d("2026-06-17"), NEW_YORK);

const EMPTY: AnalyticsInput = {
  period,
  timezone: NEW_YORK,
  focusSessions: [],
  completedTasks: [],
  workBlocks: [],
  habits: [],
  habitCompletions: [],
  projects: [],
};

describe("summariseAnalytics", () => {
  it("gives every chart an axis even when there is nothing to draw", () => {
    const summary = summariseAnalytics(EMPTY);

    expect(summary.focusByDay).toHaveLength(7);
    expect(summary.completionsByDay).toHaveLength(7);
    expect(summary.habitByDay).toHaveLength(7);
    expect(summary.completionsByHour).toHaveLength(24);
    expect(summary.focusByHour).toHaveLength(24);
    expect(summary.focusByProject).toEqual([]);
    expect(summary.estimateByProject).toEqual([]);
    expect(summary.insights).toEqual([]);
  });

  /**
   * The question the empty state asks. It is about evidence, not about the age
   * of the account: a user returning after three months away sees the same
   * designed page rather than six charts of flat zero.
   */
  it("reports an empty period as empty", () => {
    expect(summariseAnalytics(EMPTY).isEmpty).toBe(true);
  });

  it("is not empty once a single fact lands in the period", () => {
    const withOneSession = summariseAnalytics({
      ...EMPTY,
      focusSessions: [session({ date: "2026-06-15", hour: 9, minutes: 25 })],
    });
    expect(withOneSession.isEmpty).toBe(false);

    const withOneBlock = summariseAnalytics({
      ...EMPTY,
      workBlocks: [block({ date: "2026-06-15", hour: 9 })],
    });
    expect(withOneBlock.isEmpty).toBe(false);

    const withOneTask = summariseAnalytics({
      ...EMPTY,
      completedTasks: [task({ date: "2026-06-15", hour: 9 })],
    });
    expect(withOneTask.isEmpty).toBe(false);
  });

  /**
   * A per-week habit expects nothing on a given date, so it cannot make the
   * period non-empty through `expected`. Its completions still count as
   * evidence — otherwise a user who only tracks habits would be told there is
   * nothing to show while their heatmap has marks on it.
   */
  it("counts a recorded habit completion as evidence even with no daily target", () => {
    const summary = summariseAnalytics({
      ...EMPTY,
      habits: [weeklyHabit("h1", "2026-06-01")],
      habitCompletions: [completion("h1", "2026-06-15")],
    });

    expect(summary.isEmpty).toBe(false);
    expect(summary.totals.habitRate.value).toBeNull();
  });

  it("still counts a period where a habit was expected and nothing happened", () => {
    const summary = summariseAnalytics({ ...EMPTY, habits: [dailyHabit("h1", "2026-06-01")] });

    expect(summary.isEmpty).toBe(false);
    expect(summary.totals.habitRate).toEqual({ met: 0, expected: 6, value: 0 });
  });

  it("rolls the headline numbers up from the same rows the charts use", () => {
    const summary = summariseAnalytics({
      ...EMPTY,
      focusSessions: [
        session({ date: "2026-06-15", hour: 9, minutes: 50, projectId: "p1" }),
        session({ date: "2026-06-16", hour: 9, minutes: 25, projectId: "p1" }),
      ],
      completedTasks: [
        task({ date: "2026-06-15", hour: 10, estimated: 60, actual: 75, projectId: "p1" }),
        task({ date: "2026-06-16", hour: 10, estimated: null, actual: 30, projectId: "p1" }),
      ],
      workBlocks: [
        block({ date: "2026-06-15", hour: 9, minutes: 60, done: true }),
        block({ date: "2026-06-16", hour: 9, minutes: 60 }),
      ],
      projects: [{ id: "p1", name: "Research" }],
    });

    expect(summary.totals.focusedMinutes).toBe(75);
    expect(summary.totals.tasksCompleted).toBe(2);
    expect(summary.totals.blocks.scheduled).toBe(2);
    expect(summary.totals.blocks.completed).toBe(1);

    // The estimate totals cover one of the two tasks, and say so.
    expect(summary.totals.estimates.plannedMinutes).toBe(60);
    expect(summary.totals.estimates.actualMinutes).toBe(75);
    expect(summary.totals.estimates.withoutEstimate).toBe(1);

    // And the day series agrees with the total it was rolled up from.
    const focusTotal = summary.focusByDay.reduce((sum, point) => sum + point.value, 0);
    expect(focusTotal).toBe(summary.totals.focusedMinutes);
  });

  it("keeps the period it was given, so a caller can label the axis", () => {
    expect(summariseAnalytics(EMPTY).period).toBe(period);
  });
});

/**
 * The same rows through the three ranges the page offers. Nothing here is a
 * different code path — that is the point: the narrow windows are the wide
 * window's function applied to a narrower period, so a number can never mean
 * one thing on 7 days and another on 90.
 */
describe("the three ranges over one read", () => {
  const rows: Omit<AnalyticsInput, "period"> = {
    timezone: NEW_YORK,
    focusSessions: [
      session({ date: "2026-06-16", hour: 9, minutes: 60 }),
      session({ date: "2026-05-20", hour: 9, minutes: 30 }),
      session({ date: "2026-04-10", hour: 9, minutes: 90 }),
    ],
    completedTasks: [],
    workBlocks: [],
    habits: [],
    habitCompletions: [],
    projects: [],
  };

  it("widens the total as the window widens, and never double-counts", () => {
    const totals = (["7", "30", "90"] as const).map(
      (range) =>
        summariseAnalytics({ ...rows, period: analyticsPeriod(range, d("2026-06-17"), NEW_YORK) })
          .totals.focusedMinutes,
    );

    expect(totals).toEqual([60, 90, 180]);
  });
});
