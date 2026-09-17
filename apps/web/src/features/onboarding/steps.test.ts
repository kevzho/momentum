import { describe, expect, it } from "vitest";

import { localTime } from "@momentum/core/time";
import type { WorkingHours } from "@momentum/core/types";

import {
  NO_WORKING_HOURS,
  TASK_TARGET,
  allDone,
  completedCount,
  currentStep,
  describeWorkingHours,
  onboardingSteps,
} from "@/features/onboarding/steps";
import type { OnboardingState } from "@/features/onboarding/types";

const window = (start: string, end: string) => ({ start: localTime(start), end: localTime(end) });

const OFFICE = window("09:00", "17:00");
const WEEKDAYS_ONLY: WorkingHours = {
  0: [],
  1: [OFFICE],
  2: [OFFICE],
  3: [OFFICE],
  4: [OFFICE],
  5: [OFFICE],
  6: [],
};

function state(overrides: Partial<OnboardingState> = {}): OnboardingState {
  return { workingHoursSet: false, taskCount: 0, hasWorkBlock: false, ...overrides };
}

describe("onboardingSteps", () => {
  it("starts with nothing done and hours as the current step", () => {
    const steps = onboardingSteps(state());
    expect(steps.map((step) => step.done)).toEqual([false, false, false]);
    expect(completedCount(steps)).toBe(0);
    expect(currentStep(steps)).toBe("hours");
    expect(allDone(state())).toBe(false);
  });

  it("counts three tasks as the second step, however they were captured", () => {
    expect(onboardingSteps(state({ taskCount: TASK_TARGET - 1 }))[1]?.done).toBe(false);
    expect(onboardingSteps(state({ taskCount: TASK_TARGET }))[1]?.done).toBe(true);
    expect(onboardingSteps(state({ taskCount: 12 }))[1]?.done).toBe(true);
  });

  it("moves the current step past a done one, whatever order the data arrived in", () => {
    // A task added before hours were confirmed still leaves hours current.
    expect(currentStep(onboardingSteps(state({ taskCount: 3 })))).toBe("hours");
    expect(currentStep(onboardingSteps(state({ workingHoursSet: true })))).toBe("tasks");
    expect(currentStep(onboardingSteps(state({ workingHoursSet: true, taskCount: 3 })))).toBe(
      "schedule",
    );
  });

  it("is done when all three facts hold", () => {
    const finished = state({ workingHoursSet: true, taskCount: 3, hasWorkBlock: true });
    expect(allDone(finished)).toBe(true);
    expect(currentStep(onboardingSteps(finished))).toBeNull();
  });
});

describe("describeWorkingHours", () => {
  it("collapses a run of identical weekdays into one range", () => {
    expect(describeWorkingHours(WEEKDAYS_ONLY, 1)).toBe("Mon–Fri 09:00–17:00");
  });

  it("follows the user's week order and splits where the hours change", () => {
    const hours: WorkingHours = {
      ...WEEKDAYS_ONLY,
      5: [window("09:00", "13:00")],
      0: [window("10:00", "12:00")],
    };
    expect(describeWorkingHours(hours, 1)).toBe(
      "Mon–Thu 09:00–17:00 · Fri 09:00–13:00 · Sun 10:00–12:00",
    );
    expect(describeWorkingHours(hours, 0)).toBe(
      "Sun 10:00–12:00 · Mon–Thu 09:00–17:00 · Fri 09:00–13:00",
    );
  });

  it("lists non-consecutive days by name and joins a day's windows", () => {
    const split = [window("09:00", "12:00"), window("13:00", "17:00")];
    const hours: WorkingHours = { 0: [], 1: split, 2: [], 3: split, 4: [], 5: split, 6: [] };
    expect(describeWorkingHours(hours, 1)).toBe("Mon, Wed, Fri 09:00–12:00, 13:00–17:00");
  });

  it("names a week with no windows rather than returning nothing", () => {
    const none: WorkingHours = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    expect(describeWorkingHours(none, 1)).toBe(NO_WORKING_HOURS);
  });
});
