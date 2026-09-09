import { FOCUS_XP } from "@momentum/core/focus";
import { formatDuration } from "@momentum/core/time";
import type { Minutes } from "@momentum/core/types";

/**
 * Every word the focus surface says.
 *
 * One module, and tested, for two separate reasons.
 *
 * **Domain Rule 7.** A timer is the easiest place in a productivity product to
 * start scolding people. Nothing here calls a session that ended early a
 * failure, nothing warns the user about what they are about to lose, and the
 * status the database calls `abandoned` is never a word this product shows to
 * a person — it reads "Ended early", which is what happened.
 *
 * **No fabricated capabilities** (`specs/07-focus-mode.md`). Momentum is a web
 * application. It cannot block a website, silence a notification, close an app,
 * or know what the user is doing in another window. Copy that implies otherwise
 * would be a lie the product cannot make true, so `copy.test.ts` greps every
 * string here — and the source of every file in this feature — for the claims
 * this phase is specifically told not to make. The surface states what it
 * does ("records the time it actually took") and nothing more; it does not
 * carry a paragraph explaining what it will not do.
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

  /* History. */
  todayLabel: "Today",
  weekLabel: "This week",
  focused: "Focused",
  sessions: "Sessions",
  byProject: "By project",
  noProject: "No project",
  recent: "Recent sessions",
  noneToday: "No sessions recorded today.",
  noneYet: "No focus sessions yet. Start one above and Momentum will time it.",

  /* Statuses, in the product's own voice. */
  statusCompleted: "Finished",
  statusEndedEarly: "Ended early",
  statusRunning: "Running",
  statusPaused: "Paused",

  timerRegionLabel: "Focus session timer",
  historyRegionLabel: "Focus history",
} as const;

/* -------------------------------------------------------------------------- */
/* Sentences built from numbers                                               */
/* -------------------------------------------------------------------------- */

/** "25 minutes, 5 minute break" · "45 minutes". */
export function describePreset(focusMinutes: Minutes, breakMinutes: Minutes | null): string {
  const focus = `${focusMinutes} minutes`;
  return breakMinutes === null ? focus : `${focus}, ${breakMinutes} minute break`;
}

/** The button's own promise: "Start 25 minutes". */
export function describeStart(minutes: Minutes): string {
  return `Start ${minutes} minutes`;
}

/**
 * What the timer is doing, for the ring's accessible name and the line under it.
 *
 * Assistive technology gets a sentence rather than a ticking number, because a
 * live region that announced every second would be unusable; the ring's value
 * carries the progress and this carries the meaning.
 */
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
 * "120 of 300 points from focus in the last 24 hours."
 *
 * The cap is a rolling 24-hour window in the ledger (docs/DOMAIN_RULES.md
 * §21), and the sentence says so rather than "today": the number it reports
 * is measured over that window, and a figure labelled with a day the database
 * does not use would read "0 of 300" on a morning when the ledger was still
 * refusing awards. It reads the cap from `@momentum/core/focus`, which
 * `packages/db/src/focus-rules.test.ts` pins to `xp_rule()`; it states the
 * amount already awarded and predicts nothing (Domain Rule 6).
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
