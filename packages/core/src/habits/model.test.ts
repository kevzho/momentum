import { describe, expect, it } from "vitest";

import { addDays, localDate, localTime } from "../time";
import type { Habit, LocalDate } from "../types";
import {
  amountsByDate,
  cadenceOf,
  contributionOf,
  dailyTargetOf,
  isAmountHabit,
  isScheduledOn,
  weeklyTargetOf,
} from "./model";
import { habitOf } from "./test-fixtures";

const d = (value: string): LocalDate => localDate(value);

/** Monday 2026-09-07 through Sunday 2026-09-13. */
const week: LocalDate[] = Array.from({ length: 7 }, (_, i) => addDays(d("2026-09-07"), i));

describe("cadenceOf", () => {
  it("measures daily, weekdays and amount_per_day over a day", () => {
    expect(cadenceOf("daily")).toBe("per-day");
    expect(cadenceOf("weekdays")).toBe("per-day");
    expect(cadenceOf("amount_per_day")).toBe("per-day");
  });

  it("measures the two weekly types over a week", () => {
    expect(cadenceOf("times_per_week")).toBe("per-week");
    expect(cadenceOf("amount_per_week")).toBe("per-week");
  });
});

describe("isAmountHabit", () => {
  it("is true only for the accumulating types", () => {
    expect(isAmountHabit("amount_per_day")).toBe(true);
    expect(isAmountHabit("amount_per_week")).toBe(true);
    expect(isAmountHabit("daily")).toBe(false);
    expect(isAmountHabit("weekdays")).toBe(false);
    expect(isAmountHabit("times_per_week")).toBe(false);
  });
});

describe("isScheduledOn", () => {
  // 2026-09-07 is a Monday.
  it("schedules a daily habit on every date", () => {
    const habit = habitOf({ frequencyType: "daily" });
    for (const date of week) {
      expect(isScheduledOn(habit, date)).toBe(true);
    }
  });

  it("schedules a weekdays habit only on its active days", () => {
    const habit = habitOf({ frequencyType: "weekdays", activeDays: [1, 3, 5] });
    expect(isScheduledOn(habit, d("2026-09-07"))).toBe(true); // Monday
    expect(isScheduledOn(habit, d("2026-09-08"))).toBe(false); // Tuesday
    expect(isScheduledOn(habit, d("2026-09-09"))).toBe(true); // Wednesday
    expect(isScheduledOn(habit, d("2026-09-11"))).toBe(true); // Friday
    expect(isScheduledOn(habit, d("2026-09-13"))).toBe(false); // Sunday
  });

  it("schedules a per-week habit on no particular day", () => {
    const runs = habitOf({ frequencyType: "times_per_week", target: 3 });
    const minutes = habitOf({ frequencyType: "amount_per_week", target: 120, unit: "minutes" });
    for (const date of week) {
      expect(isScheduledOn(runs, date)).toBe(false);
      expect(isScheduledOn(minutes, date)).toBe(false);
    }
  });
});

describe("targets", () => {
  it("reads daily and weekdays as one tick a day", () => {
    expect(dailyTargetOf(habitOf({ frequencyType: "daily" }))).toBe(1);
    expect(dailyTargetOf(habitOf({ frequencyType: "weekdays", activeDays: [2] }))).toBe(1);
  });

  it("reads amount_per_day as its amount", () => {
    expect(dailyTargetOf(habitOf({ frequencyType: "amount_per_day", target: 15 }))).toBe(15);
  });

  it("has no per-day target for the weekly cadence", () => {
    expect(dailyTargetOf(habitOf({ frequencyType: "times_per_week", target: 3 }))).toBeNull();
    expect(weeklyTargetOf(habitOf({ frequencyType: "times_per_week", target: 3 }))).toBe(3);
    expect(weeklyTargetOf(habitOf({ frequencyType: "daily" }))).toBeNull();
  });
});

describe("contributionOf", () => {
  it("counts an amount habit's amount", () => {
    expect(contributionOf(habitOf({ frequencyType: "amount_per_week", target: 120 }), 45)).toBe(45);
  });

  it("counts a boolean habit's day as one, whatever the row says", () => {
    // record_habit_completion forces amount = 1 for boolean habits.
    expect(contributionOf(habitOf({ frequencyType: "times_per_week", target: 3 }), 4)).toBe(1);
  });

  it("counts a day with nothing recorded as nothing", () => {
    expect(contributionOf(habitOf({ frequencyType: "times_per_week", target: 3 }), 0)).toBe(0);
    expect(contributionOf(habitOf({ frequencyType: "amount_per_week", target: 120 }), 0)).toBe(0);
  });
});

describe("amountsByDate", () => {
  it("sums rows sharing a date, so an optimistic row beside a persisted one agrees with the server", () => {
    const amounts = amountsByDate([
      { completionDate: d("2026-09-07"), amount: 10 },
      { completionDate: d("2026-09-07"), amount: 5 },
      { completionDate: d("2026-09-08"), amount: 20 },
    ]);
    expect(amounts.get(d("2026-09-07"))).toBe(15);
    expect(amounts.get(d("2026-09-08"))).toBe(20);
  });
});

describe("the fixture", () => {
  it("builds a habit whose fields the domain types accept", () => {
    const habit: Habit = habitOf({
      frequencyType: "weekdays",
      activeDays: [1, 3],
      preferredStartTime: localTime("07:00"),
    });
    expect(habit.activeDays).toEqual([1, 3]);
    expect(habit.preferredStartTime).toBe("07:00");
  });
});
