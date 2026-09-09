import { describe, expect, it } from "vitest";

import {
  FOCUS_PRESETS,
  MAX_PLANNED_MINUTES,
  MIN_PLANNED_MINUTES,
  isPlannedMinutes,
  presetForMinutes,
} from "./presets";

describe("focus presets", () => {
  it("offers the three the spec names, with their break lengths", () => {
    expect(FOCUS_PRESETS.map((preset) => [preset.focusMinutes, preset.breakMinutes])).toEqual([
      [25, 5],
      [50, 10],
      [90, 20],
    ]);
  });

  it("recognises a preset length and reports a custom one as custom", () => {
    expect(presetForMinutes(50)?.id).toBe("50");
    expect(presetForMinutes(45)).toBeNull();
  });

  it("accepts every length `focus_planned_chk` accepts, and no other", () => {
    expect(isPlannedMinutes(MIN_PLANNED_MINUTES)).toBe(true);
    expect(isPlannedMinutes(MAX_PLANNED_MINUTES)).toBe(true);
    expect(isPlannedMinutes(MIN_PLANNED_MINUTES - 1)).toBe(false);
    expect(isPlannedMinutes(MAX_PLANNED_MINUTES + 1)).toBe(false);
    expect(isPlannedMinutes(25.5)).toBe(false);
    expect(isPlannedMinutes(Number.NaN)).toBe(false);
  });

  it("accepts every preset it offers", () => {
    for (const preset of FOCUS_PRESETS) {
      expect(isPlannedMinutes(preset.focusMinutes)).toBe(true);
    }
  });
});
