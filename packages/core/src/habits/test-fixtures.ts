import { instant } from "../time";
import type { Habit } from "../types";

/**
 * A habit with every field set to something harmless, for tests that care about
 * one or two of them.
 *
 * It builds a whole `Habit` rather than the `HabitSchedule` subset the maths
 * takes, so a test that hands one to a function is also checking that a real
 * row would satisfy it.
 */
export function habitOf(overrides: Partial<Habit> = {}): Habit {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "22222222-2222-4222-8222-222222222222",
    name: "Test habit",
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
    createdAt: instant("2026-01-01T00:00:00.000Z"),
    updatedAt: instant("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}
