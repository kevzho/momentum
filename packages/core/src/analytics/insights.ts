import type { IanaTimeZone, Uuid, Weekday } from "../types/scalars";
import { blocksByStartHour, blockTotals } from "./blocks";
import type { CompletedTaskFact, FocusSessionFact, ProjectFact, WorkBlockFact } from "./facts";
import { estimateComparisonByProject, estimateDeviation } from "./estimates";
import { focusMinutesByWeekday } from "./focus";
import type { AnalyticsPeriod } from "./period";

/**
 * Deterministic insight sentences (Domain Rule 8). Every sentence reports
 * what was measured, never why, and never characterises the user;
 * `insights.test.ts` enforces the vocabulary. Each kind is suppressed entirely
 * below its `INSIGHT_THRESHOLDS` sample size rather than hedged.
 */

export const INSIGHT_KINDS = [
  "time-of-day",
  "estimate-gap",
  "focus-weekday",
  "block-completion",
] as const;
export type InsightKind = (typeof INSIGHT_KINDS)[number];

export interface Insight {
  /** Stable across renders of the same period. */
  id: string;
  kind: InsightKind;
  /** The sentence, ready to render. */
  text: string;
  /** How many observations stand behind it. */
  sampleSize: number;
  /** The minimum this kind required. */
  threshold: number;
}

/** The minimum evidence each kind needs; tests assert against these names. */
export const INSIGHT_THRESHOLDS = {
  /** Work blocks in the period, and the minimum on each side of the cutoff. */
  timeOfDay: { blocks: 20, perSide: 8 },
  /** Completed tasks in one project carrying both an estimate and measured minutes. */
  estimateGap: { tasks: 5 },
  /** Measured sessions in the period, and sessions on the leading weekday. */
  focusWeekday: { sessions: 12, perWeekday: 3 },
  /** Work blocks in the period. */
  blockCompletion: { blocks: 15 },
} as const;

/** The wall-clock hour the time-of-day comparison splits on: 4 PM. */
export const TIME_OF_DAY_CUTOFF_HOUR = 16;

/** Below this gap, two completion rates are not a pattern. */
export const MIN_RATE_DIFFERENCE = 0.1;

/** Below this deviation, an estimate was accurate. */
export const MIN_ESTIMATE_DEVIATION = 0.1;

/** A weekday leader inside this margin of the runner-up is a tie, not a pattern. */
export const MIN_WEEKDAY_MARGIN = 0.15;

export interface InsightInput {
  period: AnalyticsPeriod;
  timezone: IanaTimeZone;
  focusSessions: readonly FocusSessionFact[];
  completedTasks: readonly CompletedTaskFact[];
  workBlocks: readonly WorkBlockFact[];
  /** Used only to name a project in a sentence. */
  projects: readonly ProjectFact[];
}

/** Every insight the period earns, in a stable order. `[]` when nothing clears its threshold. */
export function buildInsights(input: InsightInput): Insight[] {
  const found: Insight[] = [];
  for (const build of [
    timeOfDayInsight,
    estimateGapInsight,
    focusWeekdayInsight,
    blockCompletionInsight,
  ]) {
    const insight = build(input);
    if (insight !== null) found.push(insight);
  }
  return found;
}

/** Completion rates for work blocks scheduled either side of the cutoff, reported side by side. */
function timeOfDayInsight(input: InsightInput): Insight | null {
  const split = blocksByStartHour(
    input.workBlocks,
    input.period,
    input.timezone,
    TIME_OF_DAY_CUTOFF_HOUR,
  );

  const total = split.before.scheduled + split.after.scheduled;
  const { blocks, perSide } = INSIGHT_THRESHOLDS.timeOfDay;
  if (total < blocks) return null;
  if (split.before.scheduled < perSide || split.after.scheduled < perSide) return null;

  const beforeRate = split.before.completed / split.before.scheduled;
  const afterRate = split.after.completed / split.after.scheduled;
  if (Math.abs(beforeRate - afterRate) < MIN_RATE_DIFFERENCE) return null;

  return {
    id: "time-of-day",
    kind: "time-of-day",
    text:
      `You marked ${percent(beforeRate)} of work blocks scheduled before ` +
      `${hourLabel(TIME_OF_DAY_CUTOFF_HOUR)} as done, and ${percent(afterRate)} of those ` +
      `scheduled later.`,
    sampleSize: total,
    threshold: blocks,
  };
}

/** The one project whose completed work ran furthest from its estimates. */
function estimateGapInsight(input: InsightInput): Insight | null {
  const { tasks: minimum } = INSIGHT_THRESHOLDS.estimateGap;
  const names = new Map<Uuid, string>(input.projects.map((project) => [project.id, project.name]));

  let leader: { deviation: number; taskCount: number; projectId: Uuid | null } | null = null;

  for (const row of estimateComparisonByProject(
    input.completedTasks,
    input.period,
    input.timezone,
  )) {
    if (row.taskCount < minimum) continue;
    const deviation = estimateDeviation(row);
    if (deviation === null || Math.abs(deviation) < MIN_ESTIMATE_DEVIATION) continue;
    if (leader === null || Math.abs(deviation) > Math.abs(leader.deviation)) {
      leader = { deviation, taskCount: row.taskCount, projectId: row.projectId };
    }
  }

  if (leader === null) return null;

  const label =
    leader.projectId === null
      ? "Tasks with no project"
      : `Tasks in ${names.get(leader.projectId) ?? "an unnamed project"}`;
  const direction = leader.deviation > 0 ? "more" : "less";

  return {
    id: "estimate-gap",
    kind: "estimate-gap",
    text:
      `${label} took about ${percent(Math.abs(leader.deviation))} ${direction} time than ` +
      `estimated over this period.`,
    sampleSize: leader.taskCount,
    threshold: minimum,
  };
}

/** The weekday holding the most recorded focus time; speaks only when clearly ahead of the runner-up. */
function focusWeekdayInsight(input: InsightInput): Insight | null {
  const { sessions: minimum, perWeekday } = INSIGHT_THRESHOLDS.focusWeekday;
  const byWeekday = focusMinutesByWeekday(input.focusSessions, input.period, input.timezone);

  const totalSessions = byWeekday.reduce((total, day) => total + day.count, 0);
  if (totalSessions < minimum) return null;

  const ranked = [...byWeekday].sort((a, b) => b.value - a.value || a.weekday - b.weekday);
  const leader = ranked[0];
  const runnerUp = ranked[1];
  if (leader === undefined || runnerUp === undefined) return null;
  if (leader.value <= 0 || leader.count < perWeekday) return null;
  if (leader.value < runnerUp.value * (1 + MIN_WEEKDAY_MARGIN)) return null;

  return {
    id: "focus-weekday",
    kind: "focus-weekday",
    text: `${WEEKDAY_NAMES[leader.weekday]} holds the most recorded focus time in this period.`,
    sampleSize: totalSessions,
    threshold: minimum,
  };
}

/** How much of the scheduled work was marked done. */
function blockCompletionInsight(input: InsightInput): Insight | null {
  const totals = blockTotals(input.workBlocks, input.period, input.timezone);
  const { blocks: minimum } = INSIGHT_THRESHOLDS.blockCompletion;
  if (totals.scheduled < minimum) return null;

  return {
    id: "block-completion",
    kind: "block-completion",
    text:
      `You marked ${percent(totals.completed / totals.scheduled)} of the ` +
      `${totals.scheduled} work blocks scheduled in this period as done.`,
    sampleSize: totals.scheduled,
    threshold: minimum,
  };
}

// A label table, not date arithmetic; `scheduling/find-time.ts` keeps the same one.
const WEEKDAY_NAMES: Record<Weekday, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

/** `0.8125` → `"81%"`. */
function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** `16` → `"4 PM"`. */
function hourLabel(hour: number): string {
  const wrapped = ((hour % 24) + 24) % 24;
  const meridiem = wrapped < 12 ? "AM" : "PM";
  const display = wrapped % 12 === 0 ? 12 : wrapped % 12;
  return `${display} ${meridiem}`;
}
