import { describe, expect, it } from "vitest";

import { addDays, localDate } from "../time";
import type { LocalDate, Weekday } from "../types";
import { CONSISTENCY_WINDOW_DAYS, habitStats, habitStreaks, rateOver } from "./consistency";
import type { HabitCompletionLike, HabitSchedule } from "./model";
import { habitOf } from "./test-fixtures";

const d = (value: string): LocalDate => localDate(value);

const MONDAY: Weekday = 1;
const SUNDAY: Weekday = 0;

function done(dates: readonly LocalDate[], amount = 1): HabitCompletionLike[] {
  return dates.map((date) => ({ completionDate: date, amount }));
}

function everyNthDay(from: LocalDate, count: number, step: number): LocalDate[] {
  return Array.from({ length: count }, (_, i) => addDays(from, i * step));
}

function stats(input: {
  habit: HabitSchedule;
  completions: readonly HabitCompletionLike[];
  today: LocalDate;
  trackedFrom: LocalDate;
  weekStart?: Weekday;
}) {
  return habitStats({ weekStart: MONDAY, ...input });
}

/* -------------------------------------------------------------------------- */
/* Domain Rule 7 — a missed day lowers a rate and removes nothing              */
/* -------------------------------------------------------------------------- */

describe("a missed day", () => {
  const habit = habitOf({ frequencyType: "daily" });
  const trackedFrom = d("2026-08-15");
  const today = d("2026-09-09");

  /** Every day from 2026-08-15 up to but not including `today`. */
  const everyDay = Array.from({ length: 25 }, (_, i) => addDays(trackedFrom, i));

  it("lowers consistency", () => {
    const perfect = stats({ habit, completions: done(everyDay), today, trackedFrom });
    const withGap = stats({
      habit,
      completions: done(everyDay.filter((date) => date !== d("2026-09-01"))),
      today,
      trackedFrom,
    });

    expect(perfect.consistency.value).toBe(1);
    expect(withGap.consistency.value).toBeLessThan(1);
    expect(withGap.consistency.value).toBeGreaterThan(0.9);
  });

  it("removes nothing: the best streak survives the gap that ended it", () => {
    const withGap = stats({
      habit,
      completions: done(everyDay.filter((date) => date !== d("2026-09-01"))),
      today,
      trackedFrom,
    });

    // 2026-08-15 .. 2026-08-31 is seventeen days, and the gap does not erase it.
    expect(withGap.bestStreak).toBe(17);
    expect(withGap.currentStreak).toBe(7);
    expect(withGap.currentStreak).toBeLessThan(withGap.bestStreak);
  });
});

/* -------------------------------------------------------------------------- */
/* The unfinished period                                                      */
/* -------------------------------------------------------------------------- */

describe("the period in progress", () => {
  const habit = habitOf({ frequencyType: "daily" });
  const trackedFrom = d("2026-09-01");
  const today = d("2026-09-10");
  const before = Array.from({ length: 9 }, (_, i) => addDays(trackedFrom, i));

  it("does not count today against the user before the day is over", () => {
    const rate = stats({ habit, completions: done(before), today, trackedFrom }).consistency;
    expect(rate).toMatchObject({ met: 9, expected: 9, value: 1 });
  });

  it("counts today the moment it is met", () => {
    const rate = stats({
      habit,
      completions: done([...before, today]),
      today,
      trackedFrom,
    }).consistency;
    expect(rate).toMatchObject({ met: 10, expected: 10, value: 1 });
  });

  it("does not break a streak on an unfinished day", () => {
    const streaks = habitStreaks({
      habit,
      completions: done(before),
      today,
      trackedFrom,
      weekStart: MONDAY,
    });
    expect(streaks.current).toBe(9);
  });

  it("never breaks a streak on an unfinished week", () => {
    const runs = habitOf({ frequencyType: "times_per_week", target: 3 });
    // Two complete weeks met; the current week has one run so far.
    const completions = done([
      d("2026-08-24"),
      d("2026-08-26"),
      d("2026-08-28"),
      d("2026-08-31"),
      d("2026-09-02"),
      d("2026-09-04"),
      d("2026-09-07"),
    ]);
    const streaks = habitStreaks({
      habit: runs,
      completions,
      today: d("2026-09-09"),
      trackedFrom: d("2026-08-24"),
      weekStart: MONDAY,
    });
    expect(streaks.current).toBe(2);
    expect(streaks.best).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */
/* Week boundaries                                                            */
/* -------------------------------------------------------------------------- */

describe("week boundaries", () => {
  const runs = habitOf({ frequencyType: "times_per_week", target: 3 });

  it("counts a week in the user's own week shape, not a fixed one", () => {
    // Sun 2026-09-06, Mon 07, Tue 08. On a Monday week that is 1 + 2; on a
    // Sunday week it is all three, so the same rows meet the target or do not
    // depending only on the preference (Domain Rule 4).
    const completions = done([d("2026-09-06"), d("2026-09-07"), d("2026-09-08")]);
    const today = d("2026-09-14"); // the Monday after, so 07–13 is a finished week

    const mondayWeeks = stats({
      habit: runs,
      completions,
      today,
      trackedFrom: d("2026-08-31"),
      weekStart: MONDAY,
    });
    const sundayWeeks = stats({
      habit: runs,
      completions,
      today,
      trackedFrom: d("2026-08-30"),
      weekStart: SUNDAY,
    });

    expect(mondayWeeks.consistency.met).toBe(2 + 1);
    expect(sundayWeeks.consistency.met).toBe(3);
    expect(sundayWeeks.bestStreak).toBe(1);
    expect(mondayWeeks.bestStreak).toBe(0);
  });

  it("does not let a good week pay for a bad one", () => {
    // Six runs in one week and none in the next is 3/6, not 6/6.
    const completions = done([
      ...everyNthDay(d("2026-08-31"), 6, 1), // Mon–Sat of one week
    ]);
    const rate = rateOver(
      {
        habit: runs,
        completions,
        today: d("2026-09-14"),
        trackedFrom: d("2026-08-31"),
        weekStart: MONDAY,
      },
      { from: d("2026-08-31"), to: d("2026-09-13") },
    );
    expect(rate).toMatchObject({ met: 3, expected: 6, value: 0.5 });
  });

  it("reports no rate at all for a habit younger than one whole week", () => {
    const rate = stats({
      habit: runs,
      completions: [],
      today: d("2026-09-09"),
      trackedFrom: d("2026-09-08"),
    }).consistency;
    // "No data yet" is not "0%" (Domain Rule 7, and Domain Rule 8's sample-size
    // caution): the habit has not had a week to be measured over.
    expect(rate).toMatchObject({ met: 0, expected: 0, value: null });
  });
});

/* -------------------------------------------------------------------------- */
/* The habit's own history                                                    */
/* -------------------------------------------------------------------------- */

describe("trackedFrom", () => {
  it("expects nothing of the days before the habit existed", () => {
    const rate = stats({
      habit: habitOf({ frequencyType: "daily" }),
      completions: done([d("2026-09-08"), d("2026-09-09")]),
      today: d("2026-09-10"),
      trackedFrom: d("2026-09-08"),
    }).consistency;

    expect(rate).toMatchObject({ met: 2, expected: 2, value: 1 });
  });

  it("measures a 30-day window and no more", () => {
    const today = d("2026-09-30");
    const trackedFrom = d("2026-01-01");
    const everyDay = Array.from({ length: 300 }, (_, i) => addDays(trackedFrom, i));

    const rate = stats({
      habit: habitOf({ frequencyType: "daily" }),
      completions: done(everyDay),
      today,
      trackedFrom,
    }).consistency;

    expect(rate.expected).toBe(CONSISTENCY_WINDOW_DAYS);
  });
});

/* -------------------------------------------------------------------------- */
/* Across a DST transition                                                    */
/* -------------------------------------------------------------------------- */

describe("across a DST transition", () => {
  /*
   * Completion dates are calendar dates, not instants (Domain Rule 4), so the
   * 23-hour day of a spring-forward and the 25-hour day of a fall-back are one
   * day each — exactly like every other day. These assert that, because the
   * failure mode of doing this maths in milliseconds is a window that is one
   * day short or one day long twice a year, and a habit that reads 96% for a
   * week it was perfect on.
   *
   * 2026-03-08 (US spring forward) and 2026-11-01 (US fall back).
   */
  const habit = habitOf({ frequencyType: "daily" });

  it("counts a spring-forward day as one day", () => {
    const trackedFrom = d("2026-03-01");
    const today = d("2026-03-15");
    const everyDay = Array.from({ length: 14 }, (_, i) => addDays(trackedFrom, i));

    const rate = stats({ habit, completions: done(everyDay), today, trackedFrom }).consistency;
    expect(rate).toMatchObject({ met: 14, expected: 14, value: 1 });
  });

  it("counts a fall-back day as one day, and not as two", () => {
    const trackedFrom = d("2026-10-25");
    const today = d("2026-11-08");
    const everyDay = Array.from({ length: 14 }, (_, i) => addDays(trackedFrom, i));

    const rate = stats({ habit, completions: done(everyDay), today, trackedFrom }).consistency;
    expect(rate).toMatchObject({ met: 14, expected: 14, value: 1 });
  });

  it("keeps a streak unbroken over both transitions", () => {
    const trackedFrom = d("2026-02-25");
    const today = d("2026-11-10");
    const days = Array.from({ length: 258 }, (_, i) => addDays(trackedFrom, i));

    const streaks = habitStreaks({
      habit,
      completions: done(days),
      today,
      trackedFrom,
      weekStart: MONDAY,
    });
    expect(streaks.current).toBe(258);
    expect(streaks.best).toBe(258);
  });

  it("counts the week containing a transition as one week", () => {
    const runs = habitOf({ frequencyType: "times_per_week", target: 3 });
    // 2026-03-08 is the Sunday of the Monday week beginning 2026-03-02.
    const completions = done([d("2026-03-04"), d("2026-03-06"), d("2026-03-08")]);

    const rate = rateOver(
      {
        habit: runs,
        completions,
        today: d("2026-03-16"),
        trackedFrom: d("2026-03-02"),
        weekStart: MONDAY,
      },
      { from: d("2026-03-02"), to: d("2026-03-08") },
    );
    expect(rate).toMatchObject({ met: 3, expected: 3, value: 1 });
  });
});

/* -------------------------------------------------------------------------- */
/* Amount habits                                                              */
/* -------------------------------------------------------------------------- */

describe("amount habits", () => {
  it("measures an amount_per_day habit against its daily amount", () => {
    const meditate = habitOf({ frequencyType: "amount_per_day", target: 15, unit: "minutes" });
    const trackedFrom = d("2026-09-01");
    const today = d("2026-09-05");

    const rate = stats({
      habit: meditate,
      completions: [
        { completionDate: d("2026-09-01"), amount: 15 },
        { completionDate: d("2026-09-02"), amount: 10 },
        { completionDate: d("2026-09-03"), amount: 20 },
        { completionDate: d("2026-09-04"), amount: 15 },
      ],
      today,
      trackedFrom,
    }).consistency;

    // Four finished days; the 10-minute one did not reach the target.
    expect(rate).toMatchObject({ met: 3, expected: 4 });
  });

  it("caps a week's contribution for an amount_per_week habit", () => {
    const language = habitOf({ frequencyType: "amount_per_week", target: 120, unit: "minutes" });
    const rate = rateOver(
      {
        habit: language,
        completions: [
          { completionDate: d("2026-08-31"), amount: 300 },
          { completionDate: d("2026-09-08"), amount: 60 },
        ],
        today: d("2026-09-14"),
        trackedFrom: d("2026-08-31"),
        weekStart: MONDAY,
      },
      { from: d("2026-08-31"), to: d("2026-09-13") },
    );

    // 300 minutes in one week pays for that week only: 120 + 60 of 240.
    expect(rate).toMatchObject({ met: 180, expected: 240, value: 0.75 });
  });
});

/* -------------------------------------------------------------------------- */
/* The three windows                                                          */
/* -------------------------------------------------------------------------- */

describe("the reported windows", () => {
  it("reports this week and this month separately from the rolling 30 days", () => {
    const habit = habitOf({ frequencyType: "daily" });
    const trackedFrom = d("2026-08-01");
    const today = d("2026-09-09"); // a Wednesday

    // Everything in September, nothing in August.
    const september = Array.from({ length: 9 }, (_, i) => addDays(d("2026-09-01"), i));
    const result = stats({ habit, completions: done(september), today, trackedFrom });

    // This week: Mon 07, Tue 08 finished and met; Wed 09 met, so it counts too.
    expect(result.weekly).toMatchObject({ met: 3, expected: 3 });
    // This month: 01–09, all met.
    expect(result.monthly).toMatchObject({ met: 9, expected: 9 });
    // Rolling 30 days reaches back into August, where nothing was recorded.
    expect(result.consistency.expected).toBe(30);
    expect(result.consistency.met).toBe(9);
  });

  it("names the unit a streak is counted in", () => {
    expect(
      stats({
        habit: habitOf({ frequencyType: "daily" }),
        completions: [],
        today: d("2026-09-09"),
        trackedFrom: d("2026-09-01"),
      }).streakUnit,
    ).toBe("day");

    expect(
      stats({
        habit: habitOf({ frequencyType: "times_per_week", target: 3 }),
        completions: [],
        today: d("2026-09-09"),
        trackedFrom: d("2026-09-01"),
      }).streakUnit,
    ).toBe("week");
  });
});
