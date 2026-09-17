"use client";

import * as React from "react";
import { unstable_rethrow } from "next/navigation";
import { CheckIcon } from "lucide-react";

import type { Profile, Weekday, WorkingHours } from "@momentum/core/types";
import { useAnnounce } from "@momentum/ui/components/announcer";
import { Button } from "@momentum/ui/components/button";
import { toast } from "@momentum/ui/components/toast";
import { cn } from "@momentum/ui/lib/utils";

import { dismissOnboarding } from "@/features/onboarding/actions";
import { CHECKLIST, HOURS_STEP, STEPS, STEP_STATE, TASKS_STEP } from "@/features/onboarding/copy";
import {
  TASK_TARGET,
  completedCount,
  currentStep,
  describeWorkingHours,
  onboardingSteps,
  type OnboardingStep,
  type OnboardingStepKey,
} from "@/features/onboarding/steps";
import type { OnboardingState } from "@/features/onboarding/types";
import { updateProfileSettings } from "@/features/settings/actions";
import { WorkingHoursEditor } from "@/features/settings/components/working-hours-editor";
import { useQuickAdd } from "@/features/tasks/components/quick-add-context";
import { failure, type ActionResult } from "@/lib/actions/result";
import { reportError } from "@/lib/report-error";
import { focusFirstAvailable, tabbableNeighbours } from "@/lib/use-opener-focus";

/**
 * The first-run checklist: three steps that complete themselves as the data
 * appears. It is part of the plan panel, not an overlay. The server decides
 * each step from the profile and the tables; two facts are also read live so
 * a step ticks in the same frame as the action that completes it: a saved
 * hours form here, and a work block landing on the board.
 */
export interface OnboardingChecklistProps {
  state: OnboardingState;
  workingHours: WorkingHours;
  weekStart: Weekday;
  /** The board holds a work block right now, optimistic overlay included. */
  liveHasWorkBlock: boolean;
  /**
   * The third step's control: open Find Time for a task, or open the plan
   * sheet where the rows are. Null renders the step with its text alone.
   */
  schedule: { label: string; onActivate: () => void } | null;
  className?: string;
}

type StepState = "done" | "current" | "upcoming";

const UNAVAILABLE = "Momentum could not reach the server. Your change was not saved.";

export function OnboardingChecklist({
  state,
  workingHours,
  weekStart,
  liveHasWorkBlock,
  schedule,
  className,
}: OnboardingChecklistProps) {
  const announce = useAnnounce();
  const quickAdd = useQuickAdd();
  const headingId = React.useId();
  const progressId = React.useId();

  // Local truths that run ahead of the server's next render.
  const [hoursSaved, setHoursSaved] = React.useState(false);
  const [skipped, setSkipped] = React.useState(false);
  const [editingHours, setEditingHours] = React.useState(false);
  const [draft, setDraft] = React.useState<WorkingHours>(workingHours);
  const [saving, startSaving] = React.useTransition();
  const [, startDismiss] = React.useTransition();
  const dismissed = React.useRef(false);
  const rootRef = React.useRef<HTMLElement>(null);

  const steps = onboardingSteps({
    workingHoursSet: state.workingHoursSet || hoursSaved,
    taskCount: state.taskCount,
    hasWorkBlock: state.hasWorkBlock || liveHasWorkBlock,
  });
  const done = completedCount(steps);
  const current = currentStep(steps);
  const finished = current === null;

  // The last tick ends the checklist for good. The action does not refresh,
  // so the finished list stays until the user moves on. A failure here means
  // only that the finished list appears once more next visit.
  React.useEffect(() => {
    if (!finished || dismissed.current) return;
    dismissed.current = true;
    dismissOnboarding()
      .then((result) => {
        if (!result.ok) reportError(new Error(result.error.message), { source: "onboarding" });
      })
      .catch((thrown: unknown) => reportError(thrown, { source: "onboarding" }));
  }, [finished]);

  function saveHours(hours: WorkingHours): void {
    startSaving(async () => {
      let result: ActionResult<Profile>;
      try {
        result = await updateProfileSettings({ workingHours: hours });
      } catch (thrown) {
        unstable_rethrow(thrown);
        reportError(thrown, { source: "onboarding.hours" });
        result = failure("unavailable", UNAVAILABLE);
      }

      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }

      setHoursSaved(true);
      setEditingHours(false);
      announce("Working hours saved.");
      // The next step, opened for them: an empty account goes straight to capturing.
      if (state.taskCount === 0) quickAdd.open({ placeholder: TASKS_STEP.placeholder });
    });
  }

  function skip(): void {
    // The list removes itself and its own button; a keyboard user lands on a neighbour, not <body>.
    const root = rootRef.current;
    if (root !== null && root.contains(document.activeElement)) {
      const { next, previous } = tabbableNeighbours(root);
      focusFirstAvailable([next, previous]);
    }
    setSkipped(true);
    dismissed.current = true;

    startDismiss(async () => {
      let result: ActionResult<null>;
      try {
        result = await dismissOnboarding();
      } catch (thrown) {
        unstable_rethrow(thrown);
        reportError(thrown, { source: "onboarding.skip" });
        result = failure("unavailable", UNAVAILABLE);
      }
      if (!result.ok) {
        toast.error(result.error.message);
        setSkipped(false);
        dismissed.current = false;
      }
    });
  }

  if (skipped) return null;

  return (
    <section
      ref={rootRef}
      data-slot="onboarding-checklist"
      aria-labelledby={headingId}
      aria-describedby={progressId}
      className={cn("flex flex-col gap-2 border-b pb-3", className)}
    >
      <div className="flex items-baseline justify-between gap-2 px-2">
        <h2
          id={headingId}
          className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          {CHECKLIST.title}
        </h2>
        <div className="flex items-baseline gap-2">
          <span id={progressId} data-slot="numeric" className="text-xs text-muted-foreground">
            {CHECKLIST.progress(done, steps.length)}
          </span>
          {finished ? null : (
            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground"
              title={CHECKLIST.skipDescription}
              onClick={skip}
            >
              {CHECKLIST.skip}
            </Button>
          )}
        </div>
      </div>

      <ol className="flex flex-col gap-2 px-2">
        {steps.map((step) => {
          const stepState = stateOf(step, current);
          return (
            <StepRow key={step.key} step={step} state={stepState}>
              {stepState !== "current" ? null : step.key === "hours" ? (
                editingHours ? (
                  <div className="flex flex-col gap-3">
                    <WorkingHoursEditor
                      layout="stacked"
                      value={draft}
                      weekStart={weekStart}
                      disabled={saving}
                      onChange={setDraft}
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button size="sm" disabled={saving} onClick={() => saveHours(draft)}>
                        {saving ? HOURS_STEP.saving : HOURS_STEP.save}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={saving}
                        onClick={() => setEditingHours(false)}
                      >
                        {HOURS_STEP.cancel}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p data-slot="numeric" className="text-xs">
                      {describeWorkingHours(workingHours, weekStart)}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button size="sm" disabled={saving} onClick={() => saveHours(workingHours)}>
                        {saving ? HOURS_STEP.saving : HOURS_STEP.useThese}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={saving}
                        onClick={() => {
                          setDraft(workingHours);
                          setEditingHours(true);
                        }}
                      >
                        {HOURS_STEP.adjust}
                      </Button>
                    </div>
                  </div>
                )
              ) : step.key === "tasks" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => quickAdd.open({ placeholder: TASKS_STEP.placeholder })}
                  >
                    {TASKS_STEP.add}
                  </Button>
                  <span data-slot="numeric" className="text-xs text-muted-foreground">
                    {TASKS_STEP.count(state.taskCount, TASK_TARGET)}
                  </span>
                </div>
              ) : schedule === null ? null : (
                <div>
                  <Button size="sm" onClick={schedule.onActivate}>
                    {schedule.label}
                  </Button>
                </div>
              )}
            </StepRow>
          );
        })}
      </ol>

      {finished ? (
        <p className="px-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{CHECKLIST.doneTitle}. </span>
          {CHECKLIST.doneDescription}
        </p>
      ) : null}
    </section>
  );
}

function stateOf(step: OnboardingStep, current: OnboardingStepKey | null): StepState {
  if (step.done) return "done";
  return step.key === current ? "current" : "upcoming";
}

/**
 * One step: a 16px glyph whose shape carries the state — filled with a check,
 * a solid ring, a dashed ring — the title, and for the current step its
 * sentence and controls. The state is also a word for assistive technology.
 */
function StepRow({
  step,
  state,
  children,
}: {
  step: OnboardingStep;
  state: StepState;
  children: React.ReactNode;
}) {
  const copy = STEPS[step.key];

  return (
    <li
      data-slot="onboarding-step"
      data-state={state}
      aria-current={state === "current" ? "step" : undefined}
      className="flex gap-2"
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full",
          state === "done" && "bg-primary text-primary-foreground",
          state === "current" && "border-2 border-primary",
          state === "upcoming" && "border border-dashed border-muted-foreground/60",
        )}
      >
        {state === "done" ? <CheckIcon className="size-3" /> : null}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p
          className={cn(
            "text-sm font-medium",
            state === "current" ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <span className="sr-only">{STEP_STATE[state]}: </span>
          {copy.title}
        </p>
        {state === "current" ? (
          <p className="text-xs text-muted-foreground">{copy.description}</p>
        ) : null}
        {children}
      </div>
    </li>
  );
}
