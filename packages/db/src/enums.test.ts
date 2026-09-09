import { describe, expect, it } from "vitest";

import {
  BLOCK_KINDS,
  COSMETIC_KINDS,
  FOCUS_SESSION_STATUSES,
  HABIT_AMOUNT_UNITS,
  HABIT_FREQUENCY_TYPES,
  PROJECT_COLORS,
  QUEST_METRICS,
  QUEST_PERIODS,
  TASK_STATUSES,
  XP_SOURCE_TYPES,
  type BlockKind,
  type CosmeticKind,
  type FocusSessionStatus,
  type HabitAmountUnit,
  type HabitFrequencyType,
  type ProjectColor,
  type QuestMetric,
  type QuestPeriod,
  type TaskStatus,
  type XpSourceType,
} from "@momentum/core/types";

import type { Enums } from "./types";

/**
 * Enum parity, checked by the compiler.
 *
 * The schema is the source of truth for what exists; the domain constants are
 * the vocabulary the app speaks (docs/ARCHITECTURE.md §3). A migration that
 * adds or renames an enum value regenerates `database.types.ts`, and every
 * line below stops compiling until the matching `as const` array in
 * `@momentum/core/types` is updated. That is the whole point: the drift is
 * caught by `pnpm typecheck`, not by a runtime surprise.
 */

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

export type _TaskStatus = Expect<Equal<Enums["task_status"], TaskStatus>>;
export type _BlockKind = Expect<Equal<Enums["block_kind"], BlockKind>>;
export type _HabitFrequency = Expect<Equal<Enums["habit_frequency"], HabitFrequencyType>>;
export type _HabitUnit = Expect<Equal<Enums["habit_unit"], HabitAmountUnit>>;
export type _FocusStatus = Expect<Equal<Enums["focus_status"], FocusSessionStatus>>;
export type _XpSource = Expect<Equal<Enums["xp_source"], XpSourceType>>;
export type _QuestPeriod = Expect<Equal<Enums["quest_period"], QuestPeriod>>;
export type _QuestMetric = Expect<Equal<Enums["quest_metric"], QuestMetric>>;
export type _CosmeticKind = Expect<Equal<Enums["cosmetic_kind"], CosmeticKind>>;
export type _ProjectColor = Expect<Equal<Enums["project_color"], ProjectColor>>;

describe("enum parity", () => {
  it("keeps the runtime arrays in step with the compile-time assertions above", () => {
    // The assertions are erased at runtime, so this test exists to make the
    // file part of the suite and to catch the one mistake types cannot see:
    // an array that lists a member twice or drops one silently.
    const arrays: readonly (readonly string[])[] = [
      TASK_STATUSES,
      BLOCK_KINDS,
      HABIT_FREQUENCY_TYPES,
      HABIT_AMOUNT_UNITS,
      FOCUS_SESSION_STATUSES,
      XP_SOURCE_TYPES,
      QUEST_PERIODS,
      QUEST_METRICS,
      COSMETIC_KINDS,
      PROJECT_COLORS,
    ];

    for (const values of arrays) {
      expect(values.length).toBeGreaterThan(0);
      expect(new Set(values).size).toBe(values.length);
    }
  });
});
