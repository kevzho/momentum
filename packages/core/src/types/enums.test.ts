import { describe, expect, it } from "vitest";

import {
  BLOCK_KINDS,
  COSMETIC_KINDS,
  FOCUS_SESSION_STATUSES,
  HABIT_FREQUENCY_TYPES,
  PROJECT_COLORS,
  QUEST_METRICS,
  TASK_STATUSES,
  WEEKDAYS,
  XP_SOURCE_TYPES,
} from "./index";

describe("domain enum constants", () => {
  it("contain no duplicate members", () => {
    const lists: readonly (readonly unknown[])[] = [
      BLOCK_KINDS,
      COSMETIC_KINDS,
      FOCUS_SESSION_STATUSES,
      HABIT_FREQUENCY_TYPES,
      PROJECT_COLORS,
      QUEST_METRICS,
      TASK_STATUSES,
      WEEKDAYS,
      XP_SOURCE_TYPES,
    ];
    for (const list of lists) {
      expect(new Set(list).size).toBe(list.length);
    }
  });
});
