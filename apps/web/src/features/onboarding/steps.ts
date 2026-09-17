import { formatMinutesOfDay, minutesOfLocalTime } from "@momentum/core/time";
import type { TimeWindow, Weekday, WorkingHours } from "@momentum/core/types";

import type { OnboardingState } from "@/features/onboarding/types";
import { WEEKDAY_SHORT_NAMES, weekdaysFrom } from "@/features/settings/weekday-names";

/**
 * The three steps and what completes each. Pure: the component and the tests
 * both read these, and nothing here touches a clock or a store.
 */

/** "Add your first three tasks." */
export const TASK_TARGET = 3;

export type OnboardingStepKey = "hours" | "tasks" | "schedule";

export const STEP_ORDER: readonly OnboardingStepKey[] = ["hours", "tasks", "schedule"];

export interface OnboardingStep {
  key: OnboardingStepKey;
  done: boolean;
}

export function onboardingSteps(state: OnboardingState): readonly OnboardingStep[] {
  return [
    { key: "hours", done: state.workingHoursSet },
    { key: "tasks", done: state.taskCount >= TASK_TARGET },
    { key: "schedule", done: state.hasWorkBlock },
  ];
}

export function completedCount(steps: readonly OnboardingStep[]): number {
  return steps.filter((step) => step.done).length;
}

export function allDone(state: OnboardingState): boolean {
  return onboardingSteps(state).every((step) => step.done);
}

/** The first step still open — the one whose controls are shown. Null when every step is done. */
export function currentStep(steps: readonly OnboardingStep[]): OnboardingStepKey | null {
  return steps.find((step) => !step.done)?.key ?? null;
}

/**
 * "Mon–Fri 09:00–17:00", or "Mon–Thu 09:00–17:00 · Fri 09:00–13:00" when the
 * days differ, in the user's own week order. Days with no windows are left
 * out; a week with none reads as a fixed phrase, so the checklist never shows
 * an empty string.
 */
export function describeWorkingHours(hours: WorkingHours, weekStart: Weekday): string {
  const groups: { days: Weekday[]; windows: string }[] = [];

  for (const day of weekdaysFrom(weekStart)) {
    const windows = hours[day];
    if (windows.length === 0) continue;
    const label = windows.map(describeWindow).join(", ");
    const last = groups.at(-1);
    if (last !== undefined && last.windows === label) {
      last.days.push(day);
    } else {
      groups.push({ days: [day], windows: label });
    }
  }

  if (groups.length === 0) return NO_WORKING_HOURS;
  return groups.map((group) => `${describeDays(group.days)} ${group.windows}`).join(" · ");
}

export const NO_WORKING_HOURS = "No working hours set";

/** `Mon–Fri` for a run of consecutive days, `Mon, Wed, Fri` otherwise. */
function describeDays(days: readonly Weekday[]): string {
  const first = days[0];
  const last = days[days.length - 1];
  if (first === undefined || last === undefined) return "";
  if (days.length === 1) return WEEKDAY_SHORT_NAMES[first];

  const consecutive = days.every(
    (day, index) => index === 0 || day === ((((days[index - 1] ?? 0) + 1) % 7) as Weekday),
  );
  if (consecutive) return `${WEEKDAY_SHORT_NAMES[first]}–${WEEKDAY_SHORT_NAMES[last]}`;
  return days.map((day) => WEEKDAY_SHORT_NAMES[day]).join(", ");
}

function describeWindow(window: TimeWindow): string {
  return `${formatMinutesOfDay(minutesOfLocalTime(window.start))}–${formatMinutesOfDay(minutesOfLocalTime(window.end))}`;
}
