"use client";

import * as React from "react";
import { CircleDotIcon, PauseIcon, PlayIcon, SquareIcon } from "lucide-react";

import type { FocusTimerState } from "@momentum/core/focus";
import { formatCountdown } from "@momentum/core/time";

import { Button } from "@momentum/ui/components/button";
import { ProgressRing } from "@momentum/ui/components/progress-ring";
import { ProjectDot } from "@momentum/ui/components/project-dot";

import { FOCUS_COPY, describeElapsed, describeTimer } from "@/features/focus/copy";
import type { LiveFocusSession } from "@/features/focus/types";

/**
 * Draws a `FocusTimerState` recomputed by `useFocusTimer`; it owns no timer and
 * no counter, which is what lets the countdown survive a throttled tab.
 */

export interface FocusTimerPanelProps {
  live: LiveFocusSession;
  state: FocusTimerState;
  pending: boolean;
  /** Receives focus on the transition into a live session (the Start button has unmounted), and only then. */
  primaryControlRef?: React.RefObject<HTMLButtonElement | null>;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  onEnd: () => void;
  onMarkInterruption: () => void;
}

export function FocusTimerPanel({
  live,
  state,
  pending,
  primaryControlRef,
  onPause,
  onResume,
  onFinish,
  onEnd,
  onMarkInterruption,
}: FocusTimerPanelProps) {
  const { session, task } = live;

  // `aria-disabled` rather than native `disabled`, which would blur a focused
  // control to `<body>`; the handler refuses instead.
  const guard = (handler: () => void) => () => {
    if (pending) return;
    handler();
  };

  const label = describeTimer({
    plannedMinutes: session.plannedMinutes,
    remainingSeconds: state.remainingSeconds,
    overrunSeconds: state.overrunSeconds,
    paused: state.isPaused,
  });

  return (
    <section aria-label={FOCUS_COPY.timerRegionLabel} className="flex flex-col items-center gap-5">
      <div className="flex min-w-0 flex-col items-center gap-1 text-center">
        <p className="max-w-xs min-w-0 truncate text-sm font-medium">
          {task?.title ?? FOCUS_COPY.noTask}
        </p>
        {task?.projectName ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {task.projectColor ? (
              <ProjectDot color={task.projectColor} label={task.projectName} />
            ) : null}
            {task.projectName}
          </p>
        ) : null}
      </div>

      <ProgressRing
        value={Math.round(state.fraction * 1000)}
        max={1000}
        size={216}
        strokeWidth={10}
        label={label}
      >
        {/* The digits are hidden from assistive technology; the ring's accessible name carries the meaning. */}
        <span
          data-slot="numeric"
          aria-hidden="true"
          className="text-4xl font-semibold tabular-nums"
        >
          {state.overrunSeconds > 0
            ? `+${formatCountdown(state.overrunSeconds)}`
            : formatCountdown(state.remainingSeconds)}
        </span>
        <span aria-hidden="true" className="text-xs text-muted-foreground">
          {state.isPaused ? FOCUS_COPY.paused : FOCUS_COPY.running}
        </span>
      </ProgressRing>

      <div className="flex flex-col items-center gap-1 text-center">
        <p data-slot="numeric" className="text-xs text-muted-foreground">
          {describeElapsed(state.actualMinutes, Math.floor(state.pausedSeconds / 60))}
        </p>
        {state.isPaused ? (
          <p className="text-xs text-muted-foreground">{FOCUS_COPY.pausedHint}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {state.isPaused ? (
          <Button
            ref={primaryControlRef}
            type="button"
            variant="outline"
            onClick={guard(onResume)}
            aria-disabled={pending}
          >
            <PlayIcon aria-hidden="true" />
            {FOCUS_COPY.resume}
          </Button>
        ) : (
          <Button
            ref={primaryControlRef}
            type="button"
            variant="outline"
            onClick={guard(onPause)}
            aria-disabled={pending}
          >
            <PauseIcon aria-hidden="true" />
            {FOCUS_COPY.pause}
          </Button>
        )}

        <Button type="button" onClick={guard(onFinish)} aria-disabled={pending}>
          {FOCUS_COPY.finish}
        </Button>

        <Button type="button" variant="ghost" onClick={guard(onEnd)} aria-disabled={pending}>
          <SquareIcon aria-hidden="true" />
          {FOCUS_COPY.end}
        </Button>
      </div>

      <div className="flex flex-col items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={guard(onMarkInterruption)}
          aria-disabled={pending}
        >
          <CircleDotIcon aria-hidden="true" />
          {FOCUS_COPY.markInterruption}
          {session.interruptionCount > 0 ? (
            <span data-slot="numeric" className="text-muted-foreground">
              {session.interruptionCount}
            </span>
          ) : null}
        </Button>
        <p className="text-xs text-muted-foreground">{FOCUS_COPY.interruptionHint}</p>
      </div>
    </section>
  );
}
