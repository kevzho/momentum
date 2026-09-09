import { CheckIcon } from "lucide-react";

import { cn } from "@momentum/ui/lib/utils";

import type { PlanningGoal } from "@/features/calendar/types";
import { GOAL_DONE, goalLabel, goalTarget } from "@/features/planning/copy";

/** A weekly goal, read-only. Progress and claiming live on `/progress`, deliberately not here. */
export function WeeklyGoalRow({ goal }: { goal: PlanningGoal }) {
  const done = goal.completedAt !== null;

  return (
    <li data-done={done || undefined} className="flex items-center gap-2 px-2 py-1.5 text-sm">
      <span className={cn("min-w-0 flex-1 truncate", done && "text-muted-foreground line-through")}>
        {goalLabel(goal)}
      </span>
      {goal.title === null ? null : (
        <span data-slot="numeric" className="shrink-0 text-xs text-muted-foreground">
          {goalTarget(goal.metric, goal.target)}
        </span>
      )}
      {done ? (
        <>
          <CheckIcon aria-hidden="true" className="size-3.5 shrink-0 text-success" />
          <span className="sr-only">{GOAL_DONE}</span>
        </>
      ) : null}
    </li>
  );
}
