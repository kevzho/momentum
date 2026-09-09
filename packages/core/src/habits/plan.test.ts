import { describe, expect, it } from "vitest";

import { addDays, localDate, localTime } from "../time";
import type { LocalDate } from "../types";
import { DEFAULT_HABIT_BLOCK_MINUTES, DEFAULT_HABIT_START_MINUTES } from "./model";
import { planHabitWeek } from "./plan";
import { habitOf } from "./test-fixtures";

const d = (value: string): LocalDate => localDate(value);

/** Monday 2026-09-07 through Sunday 2026-09-13. */
const week: LocalDate[] = Array.from({ length: 7 }, (_, i) => addDays(d("2026-09-07"), i));
const monday = week[0] as LocalDate;

function dates(plans: readonly { date: LocalDate }[]): string[] {
  return plans.map((plan) => plan.date);
}

describe("planHabitWeek — per-day cadence", () => {
  it("plans every day of the week for a daily habit", () => {
    const plans = planHabitWeek({
      habit: habitOf({ frequencyType: "daily" }),
      days: week,
      today: monday,
      occupied: [],
    });
    expect(dates(plans)).toEqual(week);
  });

  it("plans only the active days of a weekdays habit", () => {
    const plans = planHabitWeek({
      habit: habitOf({ frequencyType: "weekdays", activeDays: [1, 3, 5] }),
      days: week,
      today: monday,
      occupied: [],
    });
    expect(dates(plans)).toEqual(["2026-09-07", "2026-09-09", "2026-09-11"]);
  });

  it("plans every day for an amount_per_day habit", () => {
    const plans = planHabitWeek({
      habit: habitOf({ frequencyType: "amount_per_day", target: 15, unit: "minutes" }),
      days: week,
      today: monday,
      occupied: [],
    });
    expect(plans).toHaveLength(7);
  });
});

describe("planHabitWeek — per-week cadence", () => {
  it("spreads a times_per_week habit across the week rather than bunching it", () => {
    const plans = planHabitWeek({
      habit: habitOf({ frequencyType: "times_per_week", target: 3 }),
      days: week,
      today: monday,
      occupied: [],
    });
    expect(plans).toHaveLength(3);
    expect(dates(plans)).toEqual(["2026-09-08", "2026-09-10", "2026-09-12"]);
  });

  it("plans a single session for an amount_per_week habit, whose target is a quantity", () => {
    const plans = planHabitWeek({
      habit: habitOf({ frequencyType: "amount_per_week", target: 120, unit: "minutes" }),
      days: week,
      today: monday,
      occupied: [],
    });
    expect(plans).toHaveLength(1);
  });

  it("plans every remaining day when the target exceeds the days left", () => {
    const plans = planHabitWeek({
      habit: habitOf({ frequencyType: "times_per_week", target: 5 }),
      days: week,
      today: d("2026-09-11"),
      occupied: [],
    });
    expect(dates(plans)).toEqual(["2026-09-11", "2026-09-12", "2026-09-13"]);
  });
});

describe("planHabitWeek — pressing the button twice", () => {
  it("never plans a day that already carries a block for this habit", () => {
    const plans = planHabitWeek({
      habit: habitOf({ frequencyType: "daily" }),
      days: week,
      today: monday,
      occupied: [d("2026-09-07"), d("2026-09-09")],
    });
    expect(dates(plans)).toEqual([
      "2026-09-08",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
    ]);
  });

  it("counts existing blocks toward a weekly target instead of adding a second set", () => {
    const habit = habitOf({ frequencyType: "times_per_week", target: 3 });
    const first = planHabitWeek({ habit, days: week, today: monday, occupied: [] });
    const second = planHabitWeek({
      habit,
      days: week,
      today: monday,
      occupied: first.map((plan) => plan.date),
    });
    expect(second).toEqual([]);
  });

  it("tops a weekly target back up when only some of its blocks exist", () => {
    const plans = planHabitWeek({
      habit: habitOf({ frequencyType: "times_per_week", target: 3 }),
      days: week,
      today: monday,
      occupied: [d("2026-09-08")],
    });
    expect(plans).toHaveLength(2);
    expect(dates(plans)).not.toContain("2026-09-08");
  });

  it("is idempotent for a per-day habit: the second call plans nothing", () => {
    const habit = habitOf({ frequencyType: "weekdays", activeDays: [1, 3, 5] });
    const first = planHabitWeek({ habit, days: week, today: monday, occupied: [] });
    const second = planHabitWeek({
      habit,
      days: week,
      today: monday,
      occupied: first.map((plan) => plan.date),
    });
    expect(second).toEqual([]);
  });
});

describe("planHabitWeek — the past", () => {
  it("does not reserve time that has already gone by", () => {
    const plans = planHabitWeek({
      habit: habitOf({ frequencyType: "daily" }),
      days: week,
      today: d("2026-09-10"),
      occupied: [],
    });
    expect(dates(plans)).toEqual(["2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13"]);
  });

  it("plans nothing for a week that is entirely over", () => {
    const plans = planHabitWeek({
      habit: habitOf({ frequencyType: "daily" }),
      days: week,
      today: d("2026-09-21"),
      occupied: [],
    });
    expect(plans).toEqual([]);
  });

  it("plans the whole of a future week", () => {
    const next = week.map((date) => addDays(date, 7));
    const plans = planHabitWeek({
      habit: habitOf({ frequencyType: "daily" }),
      days: next,
      today: d("2026-09-10"),
      occupied: [],
    });
    expect(dates(plans)).toEqual(next);
  });
});

describe("planHabitWeek — the span", () => {
  it("uses the habit's preferred time and estimate", () => {
    const plans = planHabitWeek({
      habit: habitOf({
        frequencyType: "daily",
        preferredStartTime: localTime("07:00"),
        estimatedMinutes: 45,
      }),
      days: [monday],
      today: monday,
      occupied: [],
    });
    expect(plans[0]).toEqual({ date: monday, startMinutes: 420, endMinutes: 465 });
  });

  it("falls back to documented defaults when the habit declares neither", () => {
    const plans = planHabitWeek({
      habit: habitOf({ frequencyType: "daily" }),
      days: [monday],
      today: monday,
      occupied: [],
    });
    expect(plans[0]).toEqual({
      date: monday,
      startMinutes: DEFAULT_HABIT_START_MINUTES,
      endMinutes: DEFAULT_HABIT_START_MINUTES + DEFAULT_HABIT_BLOCK_MINUTES,
    });
  });

  it("keeps a late block inside its own day rather than crossing midnight", () => {
    const plans = planHabitWeek({
      habit: habitOf({
        frequencyType: "daily",
        preferredStartTime: localTime("23:30"),
        estimatedMinutes: 60,
      }),
      days: [monday],
      today: monday,
      occupied: [],
    });
    expect(plans[0]).toEqual({ date: monday, startMinutes: 1380, endMinutes: 1440 });
  });
});
