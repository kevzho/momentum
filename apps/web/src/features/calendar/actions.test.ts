import { beforeEach, describe, expect, it, vi } from "vitest";

import { instant } from "@momentum/core/time";
import type { CalendarBlock } from "@momentum/core/types";

const { completeMock, uncompleteMock, completeHabitMock, uncompleteHabitMock, refreshMock } =
  vi.hoisted(() => ({
    completeMock: vi.fn(),
    uncompleteMock: vi.fn(),
    completeHabitMock: vi.fn(),
    uncompleteHabitMock: vi.fn(),
    refreshMock: vi.fn(),
  }));

vi.mock("next/cache", () => ({ refresh: refreshMock, revalidatePath: vi.fn() }));

vi.mock("@momentum/db", () => ({
  blocks: {
    complete: completeMock,
    uncomplete: uncompleteMock,
    completeHabit: completeHabitMock,
    uncompleteHabit: uncompleteHabitMock,
  },
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

const { setBlockCompletion } = await import("@/features/calendar/actions");

const BLOCK_ID = "11111111-1111-4111-8111-111111111111";
const HABIT_ID = "22222222-2222-4222-8222-222222222222";

const block: CalendarBlock = {
  id: BLOCK_ID,
  userId: "u",
  kind: "habit",
  taskId: null,
  habitId: HABIT_ID,
  title: "",
  description: null,
  startAt: instant("2026-09-09T11:00:00.000Z"),
  endAt: instant("2026-09-09T12:00:00.000Z"),
  allDay: false,
  color: null,
  completedAt: instant("2026-09-09T12:00:00.000Z"),
  seriesId: null,
  occurrenceDate: null,
  cancelled: false,
  recurrence: null,
  createdAt: instant("2026-09-01T00:00:00.000Z"),
  updatedAt: instant("2026-09-09T12:00:00.000Z"),
};

beforeEach(() => {
  completeMock.mockReset().mockResolvedValue(block);
  uncompleteMock.mockReset().mockResolvedValue(block);
  completeHabitMock.mockReset().mockResolvedValue(block);
  uncompleteHabitMock.mockReset().mockResolvedValue(block);
  refreshMock.mockReset();
});

describe("setBlockCompletion", () => {
  it("sends a habit block to the function that also records the habit's day", async () => {
    const result = await setBlockCompletion({
      id: BLOCK_ID,
      completed: true,
      habitId: HABIT_ID,
    });

    expect(result.ok).toBe(true);
    expect(completeHabitMock).toHaveBeenCalledWith({}, BLOCK_ID);
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("reverses it through the matching function, which removes only what it recorded", async () => {
    await setBlockCompletion({ id: BLOCK_ID, completed: false, habitId: HABIT_ID });

    expect(uncompleteHabitMock).toHaveBeenCalledWith({}, BLOCK_ID);
    expect(uncompleteMock).not.toHaveBeenCalled();
  });

  it("leaves a work block on the Phase 3 path, flag and all", async () => {
    await setBlockCompletion({ id: BLOCK_ID, completed: true, alsoCompleteTask: true });

    expect(completeMock).toHaveBeenCalledWith({}, BLOCK_ID, true);
    expect(completeHabitMock).not.toHaveBeenCalled();
  });

  it("is idempotent from the caller's side: two identical calls make two identical requests", async () => {
    const input = { id: BLOCK_ID, completed: true, habitId: HABIT_ID };
    await setBlockCompletion(input);
    await setBlockCompletion(input);

    expect(completeHabitMock).toHaveBeenCalledTimes(2);
    expect(completeHabitMock.mock.calls[0]).toEqual(completeHabitMock.mock.calls[1]);
  });
});
