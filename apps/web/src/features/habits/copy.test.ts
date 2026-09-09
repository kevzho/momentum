import { describe, expect, it } from "vitest";

import type { HabitRate } from "@momentum/core/habits";
import { instant, localTime } from "@momentum/core/time";
import { HABIT_FREQUENCY_TYPES, type Habit } from "@momentum/core/types";

import {
  DAY_STATE_LABELS,
  FREQUENCY_HINTS,
  FREQUENCY_LABELS,
  HABITS_COPY,
  describeAmount,
  describeDays,
  describeProgress,
  describeRate,
  describeStreak,
  describeTarget,
  formatRate,
} from "@/features/habits/copy";

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

const rate = (met: number, expected: number): HabitRate => ({
  met,
  expected,
  value: expected === 0 ? null : met / expected,
});

describe("describeTarget", () => {
  it("describes each of the five frequency shapes", () => {
    expect(describeTarget(habitOf({ frequencyType: "daily" }))).toBe("Every day");
    expect(describeTarget(habitOf({ frequencyType: "weekdays", activeDays: [1, 3, 5] }))).toBe(
      "Mon · Wed · Fri",
    );
    expect(describeTarget(habitOf({ frequencyType: "times_per_week", target: 3 }))).toBe(
      "3 days a week",
    );
    expect(
      describeTarget(habitOf({ frequencyType: "amount_per_day", target: 15, unit: "minutes" })),
    ).toBe("15m a day");
    expect(
      describeTarget(habitOf({ frequencyType: "amount_per_week", target: 120, unit: "minutes" })),
    ).toBe("2h a week");
  });

  it("appends the session length without merging it into the target", () => {
    // The target and the time reserved for it are different facts; an amount habit has both.
    expect(
      describeTarget(
        habitOf({
          frequencyType: "amount_per_day",
          target: 15,
          unit: "minutes",
          estimatedMinutes: 20,
          preferredStartTime: localTime("08:00"),
        }),
      ),
    ).toBe("15m a day · 20m a session");
  });

  it("lists days in calendar order, not the order they were chosen", () => {
    expect(describeDays([5, 1, 3])).toBe("Mon · Wed · Fri");
    expect(describeDays([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
    expect(describeDays([])).toBe("No days chosen");
  });
});

describe("describeProgress", () => {
  it("counts days for a boolean weekly habit", () => {
    expect(describeProgress(habitOf({ frequencyType: "times_per_week", target: 3 }), 2, 3)).toBe(
      "2 of 3 days",
    );
  });

  it("counts days for a daily habit too — the week strip counts days, not times", () => {
    expect(describeProgress(habitOf({ frequencyType: "daily" }), 3, 7)).toBe("3 of 7 days");
    expect(
      describeProgress(habitOf({ frequencyType: "weekdays", activeDays: [1, 3, 5] }), 0, 3),
    ).toBe("0 of 3 days");
  });

  it("counts times only for a count-based amount habit", () => {
    expect(
      describeProgress(
        habitOf({ frequencyType: "amount_per_day", target: 5, unit: "count" }),
        3,
        35,
      ),
    ).toBe("3 of 35 times");
    expect(
      describeProgress(
        habitOf({ frequencyType: "amount_per_week", target: 5, unit: "count" }),
        2,
        5,
      ),
    ).toBe("2 of 5 times");
  });

  it("uses durations for a minutes habit", () => {
    const habit = habitOf({ frequencyType: "amount_per_week", target: 120, unit: "minutes" });
    expect(describeProgress(habit, 90, 120)).toBe("1h 30m of 2h");
  });
});

describe("describeAmount", () => {
  it("renders a count and a duration differently", () => {
    expect(describeAmount(5, "count")).toBe("5 times");
    expect(describeAmount(1, "count")).toBe("Once");
    expect(describeAmount(90, "minutes")).toBe("1h 30m");
  });
});

describe("rates", () => {
  it("renders a percentage", () => {
    expect(formatRate(rate(3, 4))).toBe("75%");
  });

  it("renders no data as an em dash, never as 0%", () => {
    // A habit two days old has not failed a month; it has not had one.
    expect(formatRate(rate(0, 0))).toBe("—");
    expect(describeRate(rate(0, 0), "week")).toBe("Not enough history yet");
  });

  it("says what a rate was measured over", () => {
    expect(describeRate(rate(20, 25), "day")).toBe("20 of 25 days");
    expect(describeRate(rate(6, 9), "week")).toBe("6 of 9 counted, over whole weeks");
  });

  it("reports a streak as a plain fact", () => {
    expect(describeStreak(0, "day")).toBe("None yet");
    expect(describeStreak(1, "week")).toBe("1 week");
    expect(describeStreak(9, "day")).toBe("9 days");
  });
});

/** The words the product may not say about a person or their week; every rendered string lives in `copy.ts` so this test sees all of them. */
const FORBIDDEN =
  /\b(lazy|failed?|failure|missed|behind|unproductive|bad|poor|broken|slacking|excuse|guilt|shame|streak lost|you lost|don't break|do not break)\b/i;

describe("the habits vocabulary", () => {
  function everyString(): string[] {
    return [
      ...Object.values(FREQUENCY_LABELS),
      ...Object.values(FREQUENCY_HINTS),
      ...Object.values(DAY_STATE_LABELS),
      ...Object.values(HABITS_COPY),
      describeStreak(0, "day"),
      describeStreak(3, "week"),
      describeRate(rate(0, 0), "day"),
      describeRate(rate(1, 30), "day"),
      formatRate(rate(0, 30)),
      describeDays([]),
      ...HABIT_FREQUENCY_TYPES.map((frequencyType) =>
        describeTarget(habitOf({ frequencyType, target: frequencyType === "daily" ? 1 : 3 })),
      ),
    ];
  }

  it("never characterises the user or their week", () => {
    for (const text of everyString()) {
      expect(text, `"${text}" is punitive`).not.toMatch(FORBIDDEN);
    }
  });

  it("names a day with nothing recorded neutrally", () => {
    expect(DAY_STATE_LABELS.open).toBe("Not recorded");
    expect(DAY_STATE_LABELS.ahead).toBe("Coming up");
  });

  it("says out loud that archiving keeps everything", () => {
    expect(HABITS_COPY.archiveHint).toContain("keeps");
    expect(HABITS_COPY.emptyActiveBody).toContain("percentage");
  });
});
