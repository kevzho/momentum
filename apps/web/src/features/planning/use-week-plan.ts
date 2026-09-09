"use client";

import * as React from "react";

import {
  detectConflicts,
  weekCapacity,
  type Commitment,
  type PlanningContext,
  type PlanningTask,
  type PlanningWarning,
  type WeekCapacity,
} from "@momentum/core/scheduling";

import {
  commitmentsOf,
  liveSections,
  planningContextOf,
  planningTasksOf,
  type LiveSections,
} from "@/features/planning/live";
import type { PlanningDrawerProps } from "@/features/planning/types";

export interface WeekPlan {
  commitments: readonly Commitment[];
  context: PlanningContext;
  tasks: readonly PlanningTask[];
  sections: LiveSections;
  capacity: WeekCapacity;
  warnings: readonly PlanningWarning[];
}

/** Everything the drawer renders, memoised step by step so a `now` tick recomputes only the warnings. */
export function useWeekPlan(props: PlanningDrawerProps): WeekPlan {
  const { plan, items, settings, days, today, now } = props;

  const commitments = React.useMemo(() => commitmentsOf(items), [items]);
  const context = React.useMemo(
    () => planningContextOf(plan, settings, days, today),
    [plan, settings, days, today],
  );
  const tasks = React.useMemo(() => planningTasksOf(plan), [plan]);
  const sections = React.useMemo(() => liveSections(plan, commitments), [plan, commitments]);
  const capacity = React.useMemo(
    () => weekCapacity({ context, commitments, tasks }),
    [context, commitments, tasks],
  );
  const warnings = React.useMemo(
    () => detectConflicts({ context, commitments, tasks, now }),
    [context, commitments, tasks, now],
  );

  return { commitments, context, tasks, sections, capacity, warnings };
}
