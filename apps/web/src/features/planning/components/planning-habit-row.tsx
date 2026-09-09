"use client";

import { CalendarPlusIcon } from "lucide-react";

import { Button } from "@momentum/ui/components/button";
import { Progress } from "@momentum/ui/components/progress";
import { ProjectDot } from "@momentum/ui/components/project-dot";

import type { PlanningHabit } from "@/features/calendar/types";
import { HABITS_COPY, describeProgress, describeTarget } from "@/features/habits/copy";

/**
 * One habit in the planning drawer. Deliberately not a drag source: a habit's
 * schedule already names the days it wants, so "Add to week" is its route in.
 * The row states facts and never judges them (Domain Rule 7).
 */
export interface PlanningHabitRowProps {
  row: PlanningHabit;
  /** True while an "Add to week" for this habit is in flight. */
  pending: boolean;
  onAddToWeek: (habitId: string) => void;
}

export function PlanningHabitRow({ row, pending, onAddToWeek }: PlanningHabitRowProps) {
  const { habit, progress, reservedDates } = row;
  const reserved = reservedDates.length;

  return (
    <li className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {habit.color ? <ProjectDot color={habit.color} /> : null}
          <span className="truncate text-sm">{habit.name}</span>
        </div>
        <p className="mt-0.5 truncate text-2xs text-muted-foreground">
          {describeTarget(habit)}
          <span className="mx-1 text-muted-foreground/50">·</span>
          {describeProgress(habit, progress.achieved, progress.target)}
          {reserved > 0 ? (
            <>
              <span className="mx-1 text-muted-foreground/50">·</span>
              {reserved === 1 ? "1 day reserved" : `${reserved} days reserved`}
            </>
          ) : null}
        </p>
        <Progress
          value={Math.round(progress.fraction * 100)}
          className="mt-1 h-1"
          aria-label={`${habit.name}: ${describeProgress(habit, progress.achieved, progress.target)}`}
        />
      </div>

      <Button
        size="icon-sm"
        variant="ghost"
        className="shrink-0"
        data-pending={pending || undefined}
        title={HABITS_COPY.addToWeekHint}
        onClick={() => onAddToWeek(habit.id)}
      >
        <CalendarPlusIcon aria-hidden="true" />
        <span className="sr-only">
          {HABITS_COPY.addToWeek}: {habit.name}
        </span>
      </Button>
    </li>
  );
}
