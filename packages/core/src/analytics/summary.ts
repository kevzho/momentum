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

/**
 * One period, every number the analytics surface shows.
 *
 * This is the module's front door and the function Phase 14's weekly review
 * calls. It composes the aggregations above and adds nothing of its own, so a
 * number on the review and the same number on `/analytics` cannot drift: there
 * is one definition of "focused minutes" and both surfaces read it here.
 *
 * Pure and clock-free. The period, the timezone and the rows all arrive as
 * parameters, which is what lets the page compute three ranges from a single
 * read and lets the tests pin a DST weekend without touching the process clock.
 */

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
  /** Scheduled against executed spans (Domain Rule 13). */
  blocks: BlockTotals;
  /** Planned against actual, over the tasks that carry both (Domain Rule 3). */
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
  /**
   * The period recorded nothing at all.
   *
   * The one question the empty state asks. It is deliberately about *evidence*
   * rather than about the account's age: a user who has been away for three
   * months gets the same designed page as a new one, instead of six charts of
   * flat zero.
   */
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
