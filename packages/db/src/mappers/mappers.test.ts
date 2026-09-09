import { describe, expect, it } from "vitest";

import type { Row } from "../types";
import { rowToCalendarBlock } from "./calendar-block";
import { rowToHabit } from "./habit";
import { profileSettingsToUpdate, rowToProfile } from "./profile";
import { rowToTask } from "./task";

/**
 * Mappers are the only code that knows both the row shape and the domain
 * shape, so they are where a column rename or a loosely typed jsonb column
 * turns into a real bug. They are total functions and are tested as such:
 * every nullable lifted, every union narrowed, and a loud failure when a row
 * violates an invariant the schema is supposed to guarantee.
 */

const PROFILE_ROW: Row<"profiles"> = {
  id: "11111111-1111-4111-8111-111111111111",
  display_name: "Demo Ross",
  timezone: "America/New_York",
  week_start: 1,
  working_hours: {
    "0": [],
    "1": [{ start: "09:00", end: "17:00" }],
    "2": [{ start: "09:00", end: "12:00" }],
    "3": [],
    "4": [],
    "5": [],
    "6": [],
  },
  focus_windows: [{ start: "09:00", end: "12:00" }],
  snap_minutes: 15,
  level: 4,
  xp: 1240,
  coins: 31,
  created_at: "2026-07-12T09:00:00+00:00",
  updated_at: "2026-09-06T11:22:33.456789+00:00",
};

const TASK_ROW: Row<"tasks"> = {
  id: "task-1",
  user_id: "user-1",
  project_id: null,
  parent_task_id: null,
  title: "History essay draft",
  description: null,
  status: "open",
  priority: 1,
  estimated_minutes: 135,
  actual_minutes: 0,
  due_date: "2026-09-11",
  completed_at: null,
  archived_at: null,
  sort_order: 100,
  created_at: "2026-08-28T13:00:00+00:00",
  updated_at: "2026-08-28T13:00:00+00:00",
};

const BLOCK_ROW: Row<"calendar_blocks"> = {
  id: "block-1",
  user_id: "user-1",
  kind: "work",
  task_id: "task-1",
  habit_id: null,
  title: "",
  description: null,
  start_at: "2026-09-07T20:00:00+00:00",
  end_at: "2026-09-07T20:45:00+00:00",
  all_day: false,
  color: null,
  completed_at: null,
  recurrence: null,
  recurrence_until: null,
  series_id: null,
  occurrence_date: null,
  cancelled: false,
  created_at: "2026-08-28T13:00:00+00:00",
  updated_at: "2026-08-28T13:00:00+00:00",
};

describe("rowToProfile", () => {
  it("maps the row onto the domain profile", () => {
    const profile = rowToProfile(PROFILE_ROW);

    expect(profile.displayName).toBe("Demo Ross");
    expect(profile.timezone).toBe("America/New_York");
    expect(profile.weekStart).toBe(1);
    expect(profile.snapMinutes).toBe(15);
    expect(profile.workingHours[1]).toEqual([{ start: "09:00", end: "17:00" }]);
    expect(profile.focusWindows).toEqual([{ start: "09:00", end: "12:00" }]);
    // Microseconds are truncated to milliseconds, always with a trailing Z.
    expect(profile.updatedAt).toBe("2026-09-06T11:22:33.456Z");
  });

  it("returns a window list for all seven days even when the column is a fragment", () => {
    const profile = rowToProfile({ ...PROFILE_ROW, working_hours: { "1": [] } });

    expect(Object.keys(profile.workingHours)).toHaveLength(7);
    expect(profile.workingHours[6]).toEqual([]);
  });

  it("drops malformed windows rather than passing them to the scheduler", () => {
    const profile = rowToProfile({
      ...PROFILE_ROW,
      working_hours: {
        "1": [
          { start: "09:00", end: "17:00" },
          { start: "17:00", end: "09:00" }, // ends before it starts
          { start: "nine", end: "five" },
          { start: "09:00" },
          "09:00-17:00",
        ],
      },
    });

    expect(profile.workingHours[1]).toEqual([{ start: "09:00", end: "17:00" }]);
  });

  it("survives a column that is not the shape the check constraint implies", () => {
    const profile = rowToProfile({ ...PROFILE_ROW, working_hours: null, focus_windows: null });

    expect(profile.workingHours[1]).toEqual([]);
    expect(profile.focusWindows).toEqual([]);
  });

  it("refuses a snap increment the UI could not render", () => {
    expect(() => rowToProfile({ ...PROFILE_ROW, snap_minutes: 7 })).toThrow(TypeError);
  });
});

describe("profileSettingsToUpdate", () => {
  it("writes only the keys it was given", () => {
    expect(profileSettingsToUpdate({ displayName: "Sam" })).toEqual({ display_name: "Sam" });
    expect(profileSettingsToUpdate({})).toEqual({});
  });

  it("has no way to express the guarded columns", () => {
    const update = profileSettingsToUpdate({
      displayName: "Sam",
      weekStart: 0,
      snapMinutes: 30,
      focusWindows: [],
    });

    expect(Object.keys(update)).not.toContain("xp");
    expect(Object.keys(update)).not.toContain("level");
    expect(Object.keys(update)).not.toContain("coins");
  });

  it("serialises working hours back into the shape the column expects", () => {
    const update = profileSettingsToUpdate({
      workingHours: rowToProfile(PROFILE_ROW).workingHours,
    });

    expect(update.working_hours).toEqual({
      "0": [],
      "1": [{ start: "09:00", end: "17:00" }],
      "2": [{ start: "09:00", end: "12:00" }],
      "3": [],
      "4": [],
      "5": [],
      "6": [],
    });
  });
});

describe("rowToTask", () => {
  it("keeps the due date a calendar date and the estimate separate from the actual", () => {
    const task = rowToTask(TASK_ROW);

    expect(task.dueDate).toBe("2026-09-11");
    expect(task.estimatedMinutes).toBe(135);
    expect(task.actualMinutes).toBe(0);
    expect(task.completedAt).toBeNull();
  });

  it("carries no scheduling fields at all (Domain Rule 2)", () => {
    const task = rowToTask(TASK_ROW);

    expect(task).not.toHaveProperty("scheduledStart");
    expect(task).not.toHaveProperty("scheduledEnd");
  });

  it("refuses a priority outside the union", () => {
    expect(() => rowToTask({ ...TASK_ROW, priority: 9 })).toThrow(TypeError);
  });
});

describe("rowToCalendarBlock", () => {
  it("narrows a work block to its task", () => {
    const block = rowToCalendarBlock(BLOCK_ROW);

    expect(block.kind).toBe("work");
    if (block.kind !== "work") throw new Error("expected a work block");
    expect(block.taskId).toBe("task-1");
    expect(block.habitId).toBeNull();
  });

  it("narrows a habit block to its habit", () => {
    const block = rowToCalendarBlock({
      ...BLOCK_ROW,
      kind: "habit",
      task_id: null,
      habit_id: "habit-1",
    });

    if (block.kind !== "habit") throw new Error("expected a habit block");
    expect(block.habitId).toBe("habit-1");
  });

  it("reads a series row's recurrence rule", () => {
    const block = rowToCalendarBlock({
      ...BLOCK_ROW,
      kind: "event",
      task_id: null,
      title: "Statistics lecture",
      recurrence: {
        freq: "weekly",
        interval: 1,
        byWeekday: [2, 4],
        until: "2026-12-11",
        count: null,
        timezone: "America/New_York",
      },
      recurrence_until: "2026-12-11",
    });

    if (block.kind !== "event") throw new Error("expected an event block");
    expect(block.recurrence).toEqual({
      freq: "weekly",
      interval: 1,
      byWeekday: [2, 4],
      until: "2026-12-11",
      count: null,
      timezone: "America/New_York",
    });
  });

  it("reads an override row's occurrence date and cancellation", () => {
    const block = rowToCalendarBlock({
      ...BLOCK_ROW,
      kind: "event",
      task_id: null,
      title: "Statistics lecture",
      series_id: "series-1",
      occurrence_date: "2026-09-08",
      cancelled: true,
    });

    if (block.kind !== "event") throw new Error("expected an event block");
    expect(block.seriesId).toBe("series-1");
    expect(block.occurrenceDate).toBe("2026-09-08");
    expect(block.cancelled).toBe(true);
  });

  it("fails loudly when a row breaks the per-kind invariant", () => {
    expect(() => rowToCalendarBlock({ ...BLOCK_ROW, task_id: null })).toThrow(TypeError);
  });
});

describe("rowToHabit", () => {
  const HABIT_ROW: Row<"habits"> = {
    id: "habit-1",
    user_id: "user-1",
    name: "Gym",
    description: null,
    frequency_type: "weekdays",
    target: 1,
    unit: "count",
    active_days: [1, 3, 5],
    preferred_start_time: "07:00:00",
    estimated_minutes: 60,
    xp_reward: 8,
    color: "red",
    archived_at: null,
    created_at: "2026-07-12T09:00:00+00:00",
    updated_at: "2026-07-12T09:00:00+00:00",
  };

  it("drops the seconds Postgres adds to a time column", () => {
    expect(rowToHabit(HABIT_ROW).preferredStartTime).toBe("07:00");
  });

  it("narrows the active days to weekdays", () => {
    expect(rowToHabit(HABIT_ROW).activeDays).toEqual([1, 3, 5]);
    expect(() => rowToHabit({ ...HABIT_ROW, active_days: [1, 9] })).toThrow(TypeError);
  });
});
