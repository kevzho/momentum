import type { IanaTimeZone, Minutes } from "../types/scalars";
import { blockTotals, type BlockTotals } from "./blocks";
import type { DayValue, HourValue } from "./buckets";
import {
  estimateComparisonByProject,
  estimateTotals,
  type EstimateComparison,
  type EstimateTotals,
} from "./estimates";
import type {
  CompletedTaskFact,
  FocusSessionFact,
  HabitCompletionFact,
  HabitFact,
  ProjectFact,
  WorkBlockFact,
} from "./facts";
import {
  focusMinutesByDay,
  focusMinutesByHour,
  focusMinutesByProject,
  totalFocusMinutes,
  type ProjectMinutes,
} from "./focus";
import {
  habitCompletionRate,
  habitConsistencyByDay,
  type HabitDay,
  type HabitRateValue,
} from "./habits";
import { buildInsights, type Insight } from "./insights";
import type { AnalyticsPeriod } from "./period";
import { tasksCompletedByDay, tasksCompletedByHour, totalTasksCompleted } from "./tasks";

/** One period, every number the analytics surface and the weekly review show; composes the aggregations and adds nothing. */

export interface AnalyticsInput {
  period: AnalyticsPeriod;
  timezone: IanaTimeZone;
  focusSessions: readonly FocusSessionFact[];
  completedTasks: readonly CompletedTaskFact[];
  workBlocks: readonly WorkBlockFact[];
  habits: readonly HabitFact[];
  habitCompletions: readonly HabitCompletionFact[];
  projects: readonly ProjectFact[];
}

/** The headline numbers, above the charts. */
export interface AnalyticsTotals {
  focusedMinutes: Minutes;
  tasksCompleted: number;
  /** Met over expected; `value` is null when the period expected nothing. */
  habitRate: HabitRateValue;
  /** Scheduled against executed spans. */
  blocks: BlockTotals;
  /** Planned against actual, over the tasks that carry both. */
  estimates: EstimateTotals;
}

export interface AnalyticsSummary {
  period: AnalyticsPeriod;
  totals: AnalyticsTotals;
  /** Chart 1. */
  focusByDay: DayValue[];
  /** Chart 2. */
  focusByProject: ProjectMinutes[];
  /** Chart 3. */
  estimateByProject: EstimateComparison[];
  /** Chart 4. */
  habitByDay: HabitDay[];
  /** Chart 5. */
  completionsByDay: DayValue[];
  /** Chart 6, and the focus minutes its data table reports beside the counts. */
  completionsByHour: HourValue[];
  focusByHour: HourValue[];
  /** Only those above their sample-size threshold. Empty is a valid, expected result. */
  insights: Insight[];
  /** The period recorded nothing at all; about evidence, not the account's age. */
  isEmpty: boolean;
}

export function summariseAnalytics(input: AnalyticsInput): AnalyticsSummary {
  const { period, timezone } = input;

  const focusByDay = focusMinutesByDay(input.focusSessions, period, timezone);
  const completionsByDay = tasksCompletedByDay(input.completedTasks, period, timezone);
  const habitByDay = habitConsistencyByDay(input.habits, input.habitCompletions, period);
  const blocks = blockTotals(input.workBlocks, period, timezone);

  const totals: AnalyticsTotals = {
    focusedMinutes: totalFocusMinutes(input.focusSessions, period, timezone),
    tasksCompleted: totalTasksCompleted(input.completedTasks, period, timezone),
    habitRate: habitCompletionRate(habitByDay),
    blocks,
    estimates: estimateTotals(input.completedTasks, period, timezone),
  };

  return {
    period,
    totals,
    focusByDay,
    focusByProject: focusMinutesByProject(input.focusSessions, period, timezone),
    estimateByProject: estimateComparisonByProject(input.completedTasks, period, timezone),
    habitByDay,
    completionsByDay,
    completionsByHour: tasksCompletedByHour(input.completedTasks, period, timezone),
    focusByHour: focusMinutesByHour(input.focusSessions, period, timezone),
    insights: buildInsights({
      period,
      timezone,
      focusSessions: input.focusSessions,
      completedTasks: input.completedTasks,
      workBlocks: input.workBlocks,
      projects: input.projects,
    }),
    isEmpty:
      totals.focusedMinutes === 0 &&
      totals.tasksCompleted === 0 &&
      blocks.scheduled === 0 &&
      habitByDay.every((day) => day.expected === 0 && day.recorded === 0),
  };
}
