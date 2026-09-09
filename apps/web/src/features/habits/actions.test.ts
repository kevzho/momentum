import { beforeEach, describe, expect, it, vi } from "vitest";

import { instant, localDate } from "@momentum/core/time";
import type { CalendarBlock, Habit } from "@momentum/core/types";

/**
 * "Add to week" writes real `calendar_blocks` rows for one week — habits do not
 * use the recurrence model, and this is the whole of their calendar generation
 * (docs/ARCHITECTURE.md §11).
 *
 * The plan itself is `planHabitWeek` and is exhaustively covered in
 * `@momentum/core/habits`. What this file covers is the part only the action
 * can get wrong: reading what is already there, converting wall clock to
 * instants with the *profile's* timezone, and writing rows that carry no title
 * of their own.
 */

const { findByIdMock, listForHabitsMock, insertMock, refreshMock } = vi.hoisted(() => ({
  findByIdMock: vi.fn(),
  listForHabitsMock: vi.fn(),
  insertMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ refresh: refreshMock, revalidatePath: vi.fn() }));

vi.mock("@momentum/db", () => ({
  habits: { findById: findByIdMock },
  blocks: { listForHabits: listForHabitsMock, insert: insertMock },
}));

vi.mock("@/lib/auth/session", () => ({
  requireSession: () =>
    Promise.resolve({
      supabase: {},
      userId: "u",
      email: null,
      profile: { timezone: "America/New_York", weekStart: 1 },
    }),
}));

/*
 * The action reads the clock for "today" — the one place it may (Domain Rule
 * 4 puts the boundary in the profile timezone, not the process one). Fixing it
 * to a Monday makes the whole displayed week plannable.
 */
const NOW = new Date("2026-09-07T15:00:00.000Z");

const HABIT_ID = "11111111-1111-4111-8111-111111111111";
const WEEK_START = localDate("2026-09-07");

function habitOf(overrides: Partial<Habit> = {}): Habit {
  return {
    id: HABIT_ID,
    userId: "u",
    name: "Gym",
    description: null,
    frequencyType: "weekdays",
    target: 1,
    unit: "count",
    activeDays: [1, 3, 5],
    preferredStartTime: "07:00" as Habit["preferredStartTime"],
    estimatedMinutes: 60,
    xpReward: 8,
    color: "red",
    archivedAt: null,
    createdAt: instant("2026-08-01T00:00:00.000Z"),
    updatedAt: instant("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

function habitBlock(startAt: string, endAt: string): CalendarBlock {
  return {
    id: `block-${startAt}`,
    userId: "u",
    kind: "habit",
    taskId: null,
    habitId: HABIT_ID,
    title: "",
    description: null,
    startAt: instant(startAt),
    endAt: instant(endAt),
    allDay: false,
    color: null,
    completedAt: null,
    seriesId: null,
    occurrenceDate: null,
    cancelled: false,
    recurrence: null,
    createdAt: instant("2026-09-01T00:00:00.000Z"),
    updatedAt: instant("2026-09-01T00:00:00.000Z"),
  };
}

const { addHabitToWeek } = await import("@/features/habits/actions");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  findByIdMock.mockReset().mockResolvedValue(habitOf());
  listForHabitsMock.mockReset().mockResolvedValue([]);
  insertMock.mockReset().mockImplementation((_client, block) => Promise.resolve(block));
  refreshMock.mockReset();
});

describe("addHabitToWeek", () => {
  it("creates one block per scheduled day, at the habit's own wall-clock time", async () => {
    const result = await addHabitToWeek({ habitId: HABIT_ID, weekStartDate: WEEK_START });
    expect(result.ok).toBe(true);

    // Mon, Wed, Fri at 07:00 America/New_York = 11:00 UTC in September.
    const starts = insertMock.mock.calls.map((call) => call[1].startAt);
    expect(starts).toEqual([
      "2026-09-07T11:00:00.000Z",
      "2026-09-09T11:00:00.000Z",
      "2026-09-11T11:00:00.000Z",
    ]);
    expect(insertMock.mock.calls[0]?.[1].endAt).toBe("2026-09-07T12:00:00.000Z");
  });

  it("writes habit blocks that carry no title of their own", async () => {
    await addHabitToWeek({ habitId: HABIT_ID, weekStartDate: WEEK_START });

    for (const [, block] of insertMock.mock.calls) {
      // A habit block renders its habit's name, resolved at read time, so the
      // two can never drift (docs/DOMAIN_RULES.md §19).
      expect(block.title).toBeUndefined();
      expect(block.kind).toBe("habit");
      expect(block.habitId).toBe(HABIT_ID);
    }
  });

  it("does not double the week when it is pressed twice", async () => {
    listForHabitsMock.mockResolvedValue([
      habitBlock("2026-09-07T11:00:00.000Z", "2026-09-07T12:00:00.000Z"),
      habitBlock("2026-09-09T11:00:00.000Z", "2026-09-09T12:00:00.000Z"),
      habitBlock("2026-09-11T11:00:00.000Z", "2026-09-11T12:00:00.000Z"),
    ]);

    const result = await addHabitToWeek({ habitId: HABIT_ID, weekStartDate: WEEK_START });

    expect(result.ok).toBe(true);
    expect(insertMock).not.toHaveBeenCalled();
    if (result.ok) expect(result.data).toEqual([]);
  });

  it("tops up the days that are missing rather than starting over", async () => {
    listForHabitsMock.mockResolvedValue([
      habitBlock("2026-09-09T11:00:00.000Z", "2026-09-09T12:00:00.000Z"),
    ]);

    await addHabitToWeek({ habitId: HABIT_ID, weekStartDate: WEEK_START });

    expect(insertMock.mock.calls.map((call) => call[1].startAt)).toEqual([
      "2026-09-07T11:00:00.000Z",
      "2026-09-11T11:00:00.000Z",
    ]);
  });

  it("spreads a times_per_week habit and counts what is already placed", async () => {
    findByIdMock.mockResolvedValue(
      habitOf({
        frequencyType: "times_per_week",
        target: 3,
        activeDays: [],
        preferredStartTime: null,
        estimatedMinutes: 30,
      }),
    );

    await addHabitToWeek({ habitId: HABIT_ID, weekStartDate: WEEK_START });
    expect(insertMock).toHaveBeenCalledTimes(3);

    insertMock.mockClear();
    listForHabitsMock.mockResolvedValue([
      habitBlock("2026-09-08T12:00:00.000Z", "2026-09-08T12:30:00.000Z"),
    ]);
    await addHabitToWeek({ habitId: HABIT_ID, weekStartDate: WEEK_START });
    expect(insertMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the habit's wall-clock time across a DST transition", async () => {
    /*
     * 2026-03-08 is the US spring-forward Sunday. A 07:00 habit is at 07:00 on
     * both sides of it — 12:00Z before, 11:00Z after — because the block is
     * placed from a wall-clock reading in the profile timezone and never from a
     * fixed offset (Domain Rules 4 and 16's shared premise).
     */
    vi.setSystemTime(new Date("2026-03-02T15:00:00.000Z"));
    findByIdMock.mockResolvedValue(habitOf({ activeDays: [1, 3, 5, 0] }));

    await addHabitToWeek({ habitId: HABIT_ID, weekStartDate: localDate("2026-03-02") });

    expect(insertMock.mock.calls.map((call) => call[1].startAt)).toEqual([
      "2026-03-02T12:00:00.000Z", // Mon, EST
      "2026-03-04T12:00:00.000Z", // Wed, EST
      "2026-03-06T12:00:00.000Z", // Fri, EST
      "2026-03-08T11:00:00.000Z", // Sun, EDT — same 07:00 on the clock
    ]);
  });

  it("reports a habit that has since been deleted rather than throwing", async () => {
    findByIdMock.mockResolvedValue(null);

    const result = await addHabitToWeek({ habitId: HABIT_ID, weekStartDate: WEEK_START });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("not_found");
  });

  it("refuses input the schema rejects", async () => {
    const result = await addHabitToWeek({ habitId: "not-a-uuid", weekStartDate: WEEK_START });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("validation");
  });
});
