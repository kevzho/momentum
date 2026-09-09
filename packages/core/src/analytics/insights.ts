import type { IanaTimeZone, Uuid, Weekday } from "../types/scalars";
import { blocksByStartHour, blockTotals } from "./blocks";
import type { CompletedTaskFact, FocusSessionFact, ProjectFact, WorkBlockFact } from "./facts";
import { estimateComparisonByProject, estimateDeviation } from "./estimates";
import { focusMinutesByWeekday } from "./focus";
import type { AnalyticsPeriod } from "./period";

/**
 * The insight layer: deterministic sentences computed from the aggregations
 * above. No model, no randomness, no stored state — the same period produces
 * the same words every time.
 *
 * **Domain Rule 8 is the whole design of this file**, in three parts.
 *
 * *Correlation, never causation.* Every sentence reports something that was
 * measured and stops there. "You completed 81% of blocks scheduled before 4 PM
 * and 62% of those scheduled later" is a description of two numbers. "You work
 * better in the morning" is a claim about why, which observational data of this
 * kind cannot support — the user may schedule their easiest work early, or
 * their hardest, and nothing here can tell the difference. So no sentence in
 * this file contains a "because", a "so", or a comparative about the person.
 *
 * *Never a characterisation.* The subject of every sentence is the work, the
 * hour or the estimate — never the user's character. There is no "productive",
 * no "consistent", no "focused" as an adjective for a person, and nothing that
 * grades a period (Domain Rule 7). `insights.test.ts` enforces the vocabulary.
 *
 * *Sample-size gating.* A pattern from three data points is noise, and showing
 * noise as a finding is worse than showing nothing. Each kind declares the
 * minimum evidence it needs in `INSIGHT_THRESHOLDS`; below it the insight is
 * **suppressed entirely** rather than shown with a caveat, because a hedged
 * sentence is still a sentence the user will read as a finding. A new account
 * therefore produces an empty array, which is the correct output and the thing
 * the page's empty state renders.
 *
 * Two further floors keep a *sufficiently sampled* triviality from speaking: a
 * difference below `MIN_RATE_DIFFERENCE`, a deviation below
 * `MIN_ESTIMATE_DEVIATION`, or a weekday leader inside `MIN_WEEKDAY_MARGIN` of
 * the runner-up is not a pattern worth naming.
 */

export const INSIGHT_KINDS = [
  "time-of-day",
  "estimate-gap",
  "focus-weekday",
  "block-completion",
] as const;
export type InsightKind = (typeof INSIGHT_KINDS)[number];

export interface Insight {
  /** Stable across renders of the same period, so React keys and tests can rely on it. */
  id: string;
  kind: InsightKind;
  /** The sentence, ready to render. Reports what was measured; never why. */
  text: string;
  /** How many observations stand behind it. */
  sampleSize: number;
  /** The minimum this kind required. Kept so a surface can state the basis if it wants to. */
  threshold: number;
}

/**
 * The minimum evidence each kind needs. Deliberately values, not magic numbers
 * at the call site: they are a product decision, they are the thing a reviewer
 * should argue with, and the tests assert against these names rather than
 * against literals, so raising a bar cannot silently break a test that was
 * really checking the gate exists.
 */
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

/** Below a ten-point gap, two completion rates are not telling the user anything. */
export const MIN_RATE_DIFFERENCE = 0.1;

/** Below a tenth off, an estimate was accurate; naming it would manufacture a finding. */
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

/**
 * Every insight the period earns, in a stable order.
 *
 * Returns `[]` when nothing clears its threshold — the ordinary case for a new
 * account, and not an error.
 */
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

/* -------------------------------------------------------------------------- */
/* The four kinds                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Completion rates for work blocks scheduled either side of 4 PM.
 *
 * Two rates, reported side by side. The sentence does not say which is
 * "better", does not order them as an improvement or a decline, and draws no
 * conclusion about when the user should schedule anything.
 */
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

/**
 * The project whose completed work ran furthest from its estimates.
 *
 * One insight, not one per project: a list of six deviations is a table, and
 * the panel is for the thing worth noticing. "Took more time than estimated" is
 * a measurement of two recorded numbers, and the sentence stops there — it does
 * not say the estimate was wrong, or that the user is bad at estimating.
 */
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

/**
 * The weekday holding the most recorded focus time.
 *
 * A statement about where the minutes fell, not about the user's rhythm. It
 * speaks only when the leader is clearly ahead of the runner-up, because
 * naming a day that won by four minutes would invent a pattern.
 */
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

/** How much of the scheduled work was marked done. A count, stated plainly. */
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

/* -------------------------------------------------------------------------- */
/* Words and numbers                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The seven day names. A label table, not date arithmetic — the same private
 * constant `scheduling/find-time.ts` keeps for the same reason: it resolves no
 * date, so it has no timezone to get wrong and no business in
 * `@momentum/core/time`.
 */
const WEEKDAY_NAMES: Record<Weekday, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

/** `0.8125` → `"81%"`. Whole percentages: a decimal place implies a precision none of this has. */
function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** `16` → `"4 PM"`. The hour alone, since the cutoff is always on the hour. */
function hourLabel(hour: number): string {
  const wrapped = ((hour % 24) + 24) % 24;
  const meridiem = wrapped < 12 ? "AM" : "PM";
  const display = wrapped % 12 === 0 ? 12 : wrapped % 12;
  return `${display} ${meridiem}`;
}
