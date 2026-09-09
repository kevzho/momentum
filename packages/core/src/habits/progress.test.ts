import { describe, expect, it } from "vitest";

import { addDays, localDate } from "../time";
import type { LocalDate } from "../types";
import type { HabitCompletionLike } from "./model";
import { amountToRecord, habitDay, habitDays, weekProgress } from "./progress";
import { habitOf } from "./test-fixtures";

const d = (value: string): LocalDate => localDate(value);

/** Monday 2026-09-07 through Sunday 2026-09-13. */
const week: LocalDate[] = Array.from({ length: 7 }, (_, i) => addDays(d("2026-09-07"), i));
const wednesday = d("2026-09-09");

function done(dates: readonly string[], amount = 1): HabitCompletionLike[] {
  return dates.map((date) => ({ completionDate: d(date), amount }));
}

describe("habitDay", () => {
  const daily = habitOf({ frequencyType: "daily" });

  it("marks a scheduled day that was recorded as met", () => {
    expect(habitDay(daily, d("2026-09-07"), 1, wednesday).state).toBe("met");
  });

  it("marks a passed scheduled day with nothing recorded as open, never as missed", () => {
    expect(habitDay(daily, d("2026-09-08"), 0, wednesday).state).toBe("open");
  });

  it("does not hold today against the user until the day is over", () => {
    expect(habitDay(daily, wednesday, 0, wednesday).state).toBe("ahead");
  });

  it("marks a future scheduled day as ahead", () => {
    expect(habitDay(daily, d("2026-09-12"), 0, wednesday).state).toBe("ahead");
  });

  it("marks a day the habit does not ask for as free", () => {
    const gym = habitOf({ frequencyType: "weekdays", activeDays: [1, 3, 5] });
    expect(habitDay(gym, d("2026-09-08"), 0, wednesday).state).toBe("free");
  });

  it("still shows a completion on a day the habit did not ask for", () => {
    const gym = habitOf({ frequencyType: "weekdays", activeDays: [1, 3, 5] });
    expect(habitDay(gym, d("2026-09-08"), 1, wednesday).state).toBe("met");
  });

  it("distinguishes a partial amount from nothing at all", () => {
    const meditate = habitOf({ frequencyType: "amount_per_day", target: 15, unit: "minutes" });
    expect(habitDay(meditate, d("2026-09-08"), 10, wednesday)).toMatchObject({
      state: "partial",
      amount: 10,
      target: 15,
    });
    expect(habitDay(meditate, d("2026-09-08"), 15, wednesday).state).toBe("met");
  });

  it("treats a per-week habit's days as free until something lands on them", () => {
    const runs = habitOf({ frequencyType: "times_per_week", target: 3 });
    expect(habitDay(runs, d("2026-09-08"), 0, wednesday).state).toBe("free");
    expect(habitDay(runs, d("2026-09-08"), 1, wednesday).state).toBe("met");
  });
});

describe("habitDays", () => {
  it("resolves a whole week in the order given", () => {
    const gym = habitOf({ frequencyType: "weekdays", activeDays: [1, 3, 5] });
    const states = habitDays(gym, week, done(["2026-09-07"]), wednesday).map((day) => day.state);
    //            Mon    Tue     Wed      Thu     Fri      Sat     Sun
    expect(states).toEqual(["met", "free", "ahead", "free", "ahead", "free", "free"]);
  });
});

describe("weekProgress", () => {
  it("counts days for a times_per_week habit", () => {
    const runs = habitOf({ frequencyType: "times_per_week", target: 3 });
    expect(weekProgress(runs, week, done(["2026-09-07", "2026-09-09"]))).toEqual({
      achieved: 2,
      target: 3,
      fraction: 2 / 3,
    });
  });

  it("sums amounts for an amount_per_week habit", () => {
    const language = habitOf({ frequencyType: "amount_per_week", target: 120, unit: "minutes" });
    const progress = weekProgress(language, week, done(["2026-09-07", "2026-09-09"], 45));
    expect(progress).toEqual({ achieved: 90, target: 120, fraction: 0.75 });
  });

  it("counts only the active days of a weekdays habit", () => {
    const gym = habitOf({ frequencyType: "weekdays", activeDays: [1, 3, 5] });
    expect(weekProgress(gym, week, done(["2026-09-07", "2026-09-09"]))).toEqual({
      achieved: 2,
      target: 3,
      fraction: 2 / 3,
    });
  });

  it("caps a day's contribution at that day's target", () => {
    const meditate = habitOf({ frequencyType: "amount_per_day", target: 15, unit: "minutes" });
    // 40 minutes on Monday does not pay for Tuesday.
    const progress = weekProgress(meditate, week, done(["2026-09-07"], 40));
    expect(progress.achieved).toBe(15);
    expect(progress.target).toBe(105);
  });

  it("shows more than the target as more, without overflowing the bar", () => {
    const runs = habitOf({ frequencyType: "times_per_week", target: 2 });
    const progress = weekProgress(runs, week, done(["2026-09-07", "2026-09-08", "2026-09-09"]));
    expect(progress.achieved).toBe(3);
    expect(progress.fraction).toBe(1);
  });
});

describe("amountToRecord", () => {
  it("records one day for a boolean habit whatever the numbers say", () => {
    const daily = habitOf({ frequencyType: "daily" });
    expect(amountToRecord(daily, { amount: 0, target: 1 }, { achieved: 3, target: 7 })).toBe(1);

    const thrice = habitOf({ frequencyType: "times_per_week", target: 3 });
    expect(amountToRecord(thrice, { amount: 0, target: null }, { achieved: 1, target: 3 })).toBe(1);
  });

  it("tops a per-day amount habit up to today's target", () => {
    const meditate = habitOf({ frequencyType: "amount_per_day", target: 30, unit: "minutes" });
    expect(
      amountToRecord(meditate, { amount: 10, target: 30 }, { achieved: 10, target: 210 }),
    ).toBe(20);
    expect(amountToRecord(meditate, { amount: 0, target: 30 }, { achieved: 0, target: 210 })).toBe(
      30,
    );
  });

  it("tops a per-week amount habit up to the week's target, never to a single unit", () => {
    const language = habitOf({ frequencyType: "amount_per_week", target: 120, unit: "minutes" });
    expect(
      amountToRecord(language, { amount: 0, target: null }, { achieved: 40, target: 120 }),
    ).toBe(80);
    expect(
      amountToRecord(language, { amount: 0, target: null }, { achieved: 0, target: 120 }),
    ).toBe(120);
  });

  it("still records something once the target is already met", () => {
    const meditate = habitOf({ frequencyType: "amount_per_day", target: 30, unit: "minutes" });
    expect(
      amountToRecord(meditate, { amount: 45, target: 30 }, { achieved: 45, target: 210 }),
    ).toBe(1);

    const language = habitOf({ frequencyType: "amount_per_week", target: 120, unit: "minutes" });
    expect(
      amountToRecord(language, { amount: 0, target: null }, { achieved: 150, target: 120 }),
    ).toBe(1);
  });
});
