import type { OnboardingStepKey } from "@/features/onboarding/steps";

/**
 * Every string the first-run checklist speaks. Facts and next actions, never
 * a judgement or a cheer (Domain Rule 7); `copy.test.ts` scans the feature.
 */

export const CHECKLIST = {
  title: "Set up your week",
  /** "1 of 3 done" — the header count, and the list's accessible description. */
  progress: (done: number, total: number) => `${done} of ${total} done`,
  skip: "Skip setup",
  skipDescription: "Hides this list permanently.",
  doneTitle: "Your week has a plan",
  doneDescription:
    "This list is finished and will not come back. The panel keeps the week's numbers.",
} as const;

export const STEPS: Record<OnboardingStepKey, { title: string; description: string }> = {
  hours: {
    title: "Confirm your working hours",
    description: "Available time is measured against these.",
  },
  tasks: {
    title: "Add your first three tasks",
    description: "Whatever is on your mind. Details can come later.",
  },
  schedule: {
    title: "Give one a slot",
    description: "Drag a task onto the week, or let Find time pick a slot.",
  },
};

export const HOURS_STEP = {
  useThese: "Use these hours",
  adjust: "Adjust",
  save: "Save hours",
  saving: "Saving…",
  cancel: "Cancel",
} as const;

export const TASKS_STEP = {
  /** "1 of 3 added" */
  count: (added: number, target: number) => `${Math.min(added, target)} of ${target} added`,
  add: "Add a task",
  /** Shown inside Quick Add's title field the first time it opens from here. */
  placeholder: "e.g. Read chapter 4 by friday 90m",
} as const;

export const SCHEDULE_STEP = {
  findTime: "Find time",
  /** Below `lg` the rows with Find time live in the plan sheet. */
  openPlan: "Open the plan",
} as const;

/** The step's state as a word, for the row's accessible name. */
export const STEP_STATE = {
  done: "Done",
  current: "Current step",
  upcoming: "Not started",
} as const;
