"use client";

import * as React from "react";
import { PlayIcon } from "lucide-react";

import {
  FOCUS_PRESETS,
  MAX_PLANNED_MINUTES,
  MIN_PLANNED_MINUTES,
  isPlannedMinutes,
  presetForMinutes,
} from "@momentum/core/focus";
import { formatDuration } from "@momentum/core/time";
import type { Minutes, Uuid } from "@momentum/core/types";

import { Button } from "@momentum/ui/components/button";
import { DurationInput } from "@momentum/ui/components/duration-input";
import { Label } from "@momentum/ui/components/label";
import { ProjectDot } from "@momentum/ui/components/project-dot";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@momentum/ui/components/select";
import { SegmentedControl } from "@momentum/ui/components/segmented-control";

import { FOCUS_COPY, describePreset, describeStart } from "@/features/focus/copy";
import type { FocusTaskOption } from "@/features/focus/types";

/**
 * The focus screen at rest: how long, on what, and one button.
 *
 * The four choices `specs/07-focus-mode.md` names are one control — three
 * presets and Custom — because they are one question. Choosing Custom reveals
 * the minutes field and nothing else moves, so the layout does not jump between
 * the two shapes of the same decision.
 *
 * The task picker offers "no task", and that is a real option rather than an
 * empty state: a session with no task still measures and still records, it just
 * has no task's `actual_minutes` to move. Saying so under the control is
 * cheaper than letting someone discover it afterwards.
 */

const CUSTOM = "custom";

/** The first preset, which is the one a user who chooses nothing gets. */
const DEFAULT_MINUTES: Minutes = FOCUS_PRESETS[0]?.focusMinutes ?? 25;

type LengthChoice = (typeof FOCUS_PRESETS)[number]["id"] | typeof CUSTOM;

export interface SessionSetupProps {
  tasks: readonly FocusTaskOption[];
  /** Pre-selected from `?task=`, when the link came from a task or a block. */
  initialTaskId: Uuid | null;
  /** Pre-selected from `?minutes=`, when the link came from a calendar block. */
  initialMinutes: Minutes | null;
  pending: boolean;
  /**
   * Focus lands here when a session ends. The timer panel is replaced by this
   * one, so the control the user pressed no longer exists; the view moves focus
   * to Start on that transition and nowhere else (Domain Rule 10).
   */
  startControlRef?: React.RefObject<HTMLButtonElement | null>;
  onStart: (input: { plannedMinutes: Minutes; taskId: Uuid | null }) => void;
}

export const NO_TASK = "none";

export function SessionSetup({
  tasks,
  initialTaskId,
  initialMinutes,
  pending,
  startControlRef,
  onStart,
}: SessionSetupProps) {
  /*
   * A block's own length arrives as a number, and it is only sometimes one of
   * the presets — a 45-minute block is a custom length that the user did not
   * have to type. Both the choice and the number are seeded from it.
   */
  const seeded = initialMinutes ?? DEFAULT_MINUTES;
  const [choice, setChoice] = React.useState<LengthChoice>(
    () => presetForMinutes(seeded)?.id ?? CUSTOM,
  );
  const [customMinutes, setCustomMinutes] = React.useState<Minutes | null>(seeded);
  const [taskId, setTaskId] = React.useState<string>(initialTaskId ?? NO_TASK);

  const preset = FOCUS_PRESETS.find((entry) => entry.id === choice) ?? null;
  const plannedMinutes = preset === null ? customMinutes : preset.focusMinutes;
  const startable = plannedMinutes !== null && isPlannedMinutes(plannedMinutes);

  const selected = tasks.find((task) => task.id === taskId) ?? null;

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span
          id="focus-length-label"
          className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          {FOCUS_COPY.sessionLength}
        </span>
        <SegmentedControl<LengthChoice>
          label={FOCUS_COPY.sessionLength}
          value={choice}
          onValueChange={setChoice}
          options={[
            ...FOCUS_PRESETS.map((entry) => ({
              value: entry.id as LengthChoice,
              label: `${entry.focusMinutes}/${entry.breakMinutes}`,
              ariaLabel: describePreset(entry.focusMinutes, entry.breakMinutes),
            })),
            { value: CUSTOM, label: FOCUS_COPY.custom, ariaLabel: FOCUS_COPY.custom },
          ]}
        />

        {preset === null ? (
          <div className="flex items-center gap-2">
            <Label htmlFor="focus-custom-minutes" className="text-xs text-muted-foreground">
              {FOCUS_COPY.customLabel}
            </Label>
            <DurationInput
              id="focus-custom-minutes"
              className="w-28"
              value={customMinutes}
              min={MIN_PLANNED_MINUTES}
              max={MAX_PLANNED_MINUTES}
              onValueChange={setCustomMinutes}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {describePreset(preset.focusMinutes, preset.breakMinutes)}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="focus-task" className="text-xs font-medium tracking-wide uppercase">
          {FOCUS_COPY.workingOn}
        </Label>
        <Select value={taskId} onValueChange={setTaskId} disabled={pending}>
          <SelectTrigger id="focus-task" className="w-full">
            <SelectValue placeholder={FOCUS_COPY.pickTask} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_TASK}>{FOCUS_COPY.noTask}</SelectItem>
            {tasks.map((task) => (
              <SelectItem key={task.id} value={task.id}>
                <span className="flex min-w-0 items-center gap-2">
                  {task.projectColor ? (
                    <ProjectDot color={task.projectColor} label={task.projectName ?? undefined} />
                  ) : null}
                  <span className="min-w-0 truncate">{task.title}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {selected === null ? FOCUS_COPY.noTaskHint : describeSelected(selected)}
        </p>
      </div>

      {/*
        `aria-disabled`, never the native attribute. The browser blurs an element
        the moment it is disabled, so a Start button that disabled itself on
        press would drop a keyboard user on `<body>` by working — the defect the
        Phase 5 audit found at four other sites (Domain Rule 10). The handler
        refuses instead, which is what makes the attribute truthful.
      */}
      <Button
        ref={startControlRef}
        type="button"
        aria-disabled={!startable || pending}
        onClick={() => {
          if (pending || !startable || plannedMinutes === null) return;
          onStart({ plannedMinutes, taskId: taskId === NO_TASK ? null : taskId });
        }}
      >
        <PlayIcon aria-hidden="true" />
        {pending
          ? FOCUS_COPY.starting
          : // The button promises a length only while it has one: an emptied
            // custom field must not read "Start 0 minutes".
            startable
            ? describeStart(plannedMinutes)
            : FOCUS_COPY.start}
      </Button>
    </div>
  );
}

/**
 * What is already known about the task, stated plainly.
 *
 * Estimate and measured time are shown side by side and never merged: they are
 * different facts, and the gap between them is the signal Domain Rule 3 exists
 * to protect.
 */
function describeSelected(task: FocusTaskOption): string {
  const parts: string[] = [];
  if (task.projectName !== null) parts.push(task.projectName);
  if (task.estimatedMinutes !== null) {
    parts.push(`${formatDuration(task.estimatedMinutes)} estimated`);
  }
  if (task.actualMinutes > 0) parts.push(`${formatDuration(task.actualMinutes)} recorded so far`);
  return parts.join(" · ");
}
