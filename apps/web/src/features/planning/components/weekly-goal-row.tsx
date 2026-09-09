import { CheckIcon } from "lucide-react";

import { cn } from "@momentum/ui/lib/utils";

import type { PlanningGoal } from "@/features/calendar/types";
import { GOAL_DONE, goalLabel, goalTarget } from "@/features/planning/copy";

/**
 * A weekly goal, read-only. Its title — or, when it has none, a phrase built
 * from its metric and target — and a check when it is done.
 *
 * Progress and claiming live on `/progress` (Phase 8), where the week's goals
 * sit beside the quests and the level they feed. They are absent here on
 * purpose: the drawer would need four more reads on the heaviest page in the
 * product to show a number that is one click away.
 */
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
