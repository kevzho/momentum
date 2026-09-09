import { describe, expect, it } from "vitest";

import { habitDays, habitStats, weekProgress } from "@momentum/core/habits";
import { addDays, instant, localDate } from "@momentum/core/time";
import type { Habit, HabitCompletion, LocalDate } from "@momentum/core/types";

import { applyCompletion } from "@/features/habits/optimistic";
import type { HabitView, HabitsPageData } from "@/features/habits/types";

/** The overlay must predict exactly what `record_habit_completion` and `remove_habit_completion` write. */

const TODAY = localDate("2026-09-09");
const WEEK: readonly LocalDate[] = Array.from({ length: 7 }, (_, i) =>
  addDays(localDate("2026-09-07"), i),
);

function habitOf(overrides: Partial<Habit> = {}): Habit {
  return {
    id: "habit-1",
    userId: "user-1",
    name: "Read 20 pages",
    description: null,
    frequencyType: "daily",
    target: 1,
    unit: "count",
    activeDays: [],
    preferredStartTime: null,
    estimatedMinutes: null,
    xpReward: 5,
    color: null,
    archivedAt: null,
    createdAt: instant("2026-08-01T00:00:00.000Z"),
    updatedAt: instant("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

function completion(date: LocalDate, amount = 1): HabitCompletion {
  return {
    id: `row-${date}`,
    habitId: "habit-1",
    userId: "user-1",
    completionDate: date,
    amount,
    sourceBlockId: null,
    completedAt: instant("2026-09-08T12:00:00.000Z"),
  };
}

function pageOf(habit: Habit, history: readonly HabitCompletion[]): HabitsPageData {
  const trackedFrom = localDate("2026-08-01");
  const view: HabitView = {
    habit,
    week: habitDays(habit, WEEK, history, TODAY),
    progress: weekProgress(habit, WEEK, history),
    stats: habitStats({ habit, completions: history, today: TODAY, weekStart: 1, trackedFrom }),
    reservedDates: [],
    trackedFrom,
    history,
  };

  return {
    today: TODAY,
    timezone: "America/New_York" as HabitsPageData["timezone"],
    weekStart: 1,
    week: WEEK,
    historyFrom: trackedFrom,
    active: [view],
    archived: [],
  };
}

const first = (page: HabitsPageData): HabitView => page.active[0] as HabitView;

describe("recording a day", () => {
  it("adds one row and moves every derived number with it", () => {
    const page = pageOf(habitOf(), []);
    const next = applyCompletion(page, {
      habitId: "habit-1",
      date: TODAY,
      recorded: true,
      amount: 1,
    });

    const view = first(next);
    expect(view.history).toHaveLength(1);
    expect(view.week.find((day) => day.date === TODAY)?.state).toBe("met");
    expect(view.progress.achieved).toBe(1);
    expect(view.stats.currentStreak).toBe(1);
  });

  it("leaves every other habit untouched", () => {
    const page = pageOf(habitOf(), []);
    const other: HabitView = { ...first(page), habit: habitOf({ id: "habit-2" }) };
    const withTwo: HabitsPageData = { ...page, active: [first(page), other] };

    const next = applyCompletion(withTwo, {
      habitId: "habit-1",
      date: TODAY,
      recorded: true,
      amount: 1,
    });
    expect(next.active[1]?.history).toHaveLength(0);
  });
});

describe("deduplication (Domain Rule 14)", () => {
  it("keeps exactly one row when a boolean habit's day is recorded twice", () => {
    const page = pageOf(habitOf(), []);
    const once = applyCompletion(page, {
      habitId: "habit-1",
      date: TODAY,
      recorded: true,
      amount: 1,
    });
    const twice = applyCompletion(once, {
      habitId: "habit-1",
      date: TODAY,
      recorded: true,
      amount: 1,
    });

    expect(first(twice).history).toHaveLength(1);
    expect(first(twice).history[0]?.amount).toBe(1);
    // The second press is the same no-op the database performs when the row exists.
    expect(first(twice).progress).toEqual(first(once).progress);
  });

  it("never writes a second row for a date that already has one", () => {
    const page = pageOf(habitOf(), [completion(TODAY)]);
    const next = applyCompletion(page, {
      habitId: "habit-1",
      date: TODAY,
      recorded: true,
      amount: 1,
    });

    const forToday = first(next).history.filter((row) => row.completionDate === TODAY);
    expect(forToday).toHaveLength(1);
  });

  it("accumulates within the day for an amount habit, in one row", () => {
    const habit = habitOf({ frequencyType: "amount_per_day", target: 30, unit: "minutes" });
    const page = pageOf(habit, [completion(TODAY, 10)]);

    const next = applyCompletion(page, {
      habitId: "habit-1",
      date: TODAY,
      recorded: true,
      amount: 20,
    });

    expect(first(next).history).toHaveLength(1);
    expect(first(next).history[0]?.amount).toBe(30);
    expect(first(next).week.find((day) => day.date === TODAY)?.state).toBe("met");
  });

  it("shows a short amount as partial, not as done", () => {
    const habit = habitOf({ frequencyType: "amount_per_day", target: 30, unit: "minutes" });
    const page = pageOf(habit, []);

    const next = applyCompletion(page, {
      habitId: "habit-1",
      date: localDate("2026-09-08"),
      recorded: true,
      amount: 10,
    });

    expect(first(next).week.find((day) => day.date === "2026-09-08")?.state).toBe("partial");
  });
});

describe("removing a day", () => {
  it("deletes the row rather than decrementing it, as remove_habit_completion does", () => {
    const habit = habitOf({ frequencyType: "amount_per_day", target: 30, unit: "minutes" });
    const page = pageOf(habit, [completion(TODAY, 30)]);

    const next = applyCompletion(page, {
      habitId: "habit-1",
      date: TODAY,
      recorded: false,
      amount: 30,
    });

    expect(first(next).history).toHaveLength(0);
  });

  it("removes nothing that was earned: the best streak survives", () => {
    const history = [
      completion(localDate("2026-09-05")),
      completion(localDate("2026-09-06")),
      completion(localDate("2026-09-07")),
      completion(localDate("2026-09-08")),
    ];
    const page = pageOf(habitOf(), history);
    const before = first(page).stats.bestStreak;

    const next = applyCompletion(page, {
      habitId: "habit-1",
      date: localDate("2026-09-08"),
      recorded: false,
      amount: 1,
    });

    // The rate falls, and the record of what happened before it does not.
    expect(first(next).stats.consistency.value).toBeLessThan(
      first(page).stats.consistency.value ?? 1,
    );
    expect(first(next).stats.bestStreak).toBe(before - 1);
    expect(first(next).history).toHaveLength(3);
  });

  it("is a no-op for a day that was never recorded", () => {
    const page = pageOf(habitOf(), []);
    const next = applyCompletion(page, {
      habitId: "habit-1",
      date: TODAY,
      recorded: false,
      amount: 1,
    });
    expect(first(next).history).toHaveLength(0);
  });
});
