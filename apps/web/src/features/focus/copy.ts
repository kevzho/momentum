import { FOCUS_XP } from "@momentum/core/focus";
import { formatDuration } from "@momentum/core/time";
import type { Minutes } from "@momentum/core/types";

/**
 * Every user-facing string of the focus surface, in one tested module. Nothing
 * here scolds (`abandoned` reads "Ended early"), and nothing claims a capability
 * a web page lacks; `copy.test.ts` greps the strings and the feature's source.
 */

export const FOCUS_COPY = {
  title: "Focus",
  description: "Work one task for a fixed stretch. Momentum records the time it actually took.",

  sessionLength: "Session length",
  custom: "Custom",
  customLabel: "Minutes",
  workingOn: "Working on",
  noTask: "No task — just the timer",
  noTaskHint: "Time is still recorded. Only a linked task gets the minutes.",
  pickTask: "Choose a task",
  start: "Start session",
  starting: "Starting…",

  pause: "Pause",
  resume: "Resume",
  finish: "Finish session",
  end: "End session",
  markInterruption: "Mark an interruption",
  interruptionHint: "Counted only when you say so. Nothing is deducted.",

  running: "Running",
  paused: "Paused",
  pausedHint: "Paused time is not counted toward the session.",
  ready: "Ready",

  todayLabel: "Today",
  weekLabel: "This week",
  focused: "Focused",
  sessions: "Sessions",
  byProject: "By project",
  noProject: "No project",
  recent: "Recent sessions",
  noneToday: "No sessions recorded today.",
  noneYet: "No focus sessions yet. Start one above and Momentum will time it.",

  statusCompleted: "Finished",
  statusEndedEarly: "Ended early",
  statusRunning: "Running",
  statusPaused: "Paused",

  timerRegionLabel: "Focus session timer",
  historyRegionLabel: "Focus history",
} as const;

/** "25 minutes, 5 minute break" · "45 minutes". */
export function describePreset(focusMinutes: Minutes, breakMinutes: Minutes | null): string {
  const focus = `${focusMinutes} minutes`;
  return breakMinutes === null ? focus : `${focus}, ${breakMinutes} minute break`;
}

/** The button's own promise: "Start 25 minutes". */
export function describeStart(minutes: Minutes): string {
  return `Start ${minutes} minutes`;
}

/** The ring's accessible name: a sentence, not a ticking number. */
export function describeTimer(input: {
  plannedMinutes: Minutes;
  remainingSeconds: number;
  overrunSeconds: number;
  paused: boolean;
}): string {
  if (input.paused) {
    return `Paused, ${formatDuration(Math.ceil(input.remainingSeconds / 60))} left of ${input.plannedMinutes} minutes`;
  }
  if (input.overrunSeconds > 0) {
    return `Past the planned ${input.plannedMinutes} minutes by ${formatDuration(Math.floor(input.overrunSeconds / 60))}`;
  }
  return `${formatDuration(Math.ceil(input.remainingSeconds / 60))} left of ${input.plannedMinutes} minutes`;
}

/** "25m focused" · "25m focused, 4m paused". */
export function describeElapsed(elapsedMinutes: Minutes, pausedMinutes: Minutes): string {
  const focused = `${formatDuration(elapsedMinutes)} focused`;
  return pausedMinutes > 0 ? `${focused}, ${formatDuration(pausedMinutes)} paused` : focused;
}

/**
 * "120 of 300 points from focus in the last 24 hours." The ledger's cap is a
 * rolling 24-hour window, so the sentence must say that rather than "today".
 * States what was awarded; predicts nothing.
 */
export function describeXpInCapWindow(awarded: number): string {
  return `${awarded} of ${FOCUS_XP.dailyCap} points from focus in the last 24 hours.`;
}

/** "3 sessions · 1h 15m" — the shape both totals use. */
export function describeTotals(input: {
  completedSessions: number;
  focusedMinutes: Minutes;
}): string {
  const sessions =
    input.completedSessions === 1 ? "1 session" : `${input.completedSessions} sessions`;
  return `${sessions} · ${formatDuration(input.focusedMinutes)}`;
}
