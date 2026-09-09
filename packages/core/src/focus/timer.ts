import type { Instant, Minutes } from "../types/scalars";
import type { FocusSessionStatus } from "../types/focus";
import { durationSeconds } from "../time/duration";

/**
 * The timer as arithmetic over persisted timestamps. Nothing here counts
 * ticks: every number is recomputed from `startedAt`, the pause records and
 * `now`, so throttled tabs, sleep and reloads all give the same answer. The
 * recorded duration comes from `finish_focus_session`, never from here.
 */

export interface FocusPauseSpan {
  pausedAt: Instant;
  /** Null while the session is paused. */
  resumedAt: Instant | null;
}

export interface FocusTimerInput {
  plannedMinutes: Minutes;
  startedAt: Instant;
  /** Set once the session is completed or abandoned; the horizon stops there. */
  endedAt: Instant | null;
  status: FocusSessionStatus;
  pauses: readonly FocusPauseSpan[];
}

export interface FocusTimerState {
  /** Focused seconds: wall time since the start, less every paused span. */
  elapsedSeconds: number;
  pausedSeconds: number;
  /** Never negative: a session that runs past its planned length has 0 left. */
  remainingSeconds: number;
  /** Seconds worked beyond the planned length. Focus is not stopped at the bell. */
  overrunSeconds: number;
  /** The minutes this session would record if it finished now. Truncated, as `finish_focus_session` does. */
  actualMinutes: Minutes;
  /** 0..1 of the planned length, clamped. The ring reads this. */
  fraction: number;
  isPaused: boolean;
  /** Running or paused: a session that is still the user's live session. */
  isLive: boolean;
  reachedPlanned: boolean;
}

export const LIVE_FOCUS_STATUSES: readonly FocusSessionStatus[] = ["running", "paused"];

export function isLiveFocusStatus(status: FocusSessionStatus): boolean {
  return LIVE_FOCUS_STATUSES.includes(status);
}

/**
 * The horizon is `endedAt` for a finished session and `now` otherwise, so a
 * completed session's numbers are frozen. `now` is clamped up to `startedAt`:
 * the start is the database's clock and `now` the browser's, and a browser a
 * few seconds behind would otherwise show a negative elapsed time.
 */
export function focusTimerState(input: FocusTimerInput, now: Instant): FocusTimerState {
  const horizon = input.endedAt ?? later(input.startedAt, now);
  const grossSeconds = Math.max(0, durationSeconds(input.startedAt, horizon));
  const pausedSeconds = pausedSecondsWithin(input.pauses, input.startedAt, horizon);
  const elapsedSeconds = Math.max(0, grossSeconds - pausedSeconds);

  const plannedSeconds = Math.max(0, input.plannedMinutes) * 60;
  const remainingSeconds = Math.max(0, plannedSeconds - elapsedSeconds);
  const overrunSeconds = Math.max(0, elapsedSeconds - plannedSeconds);

  return {
    elapsedSeconds,
    pausedSeconds,
    remainingSeconds,
    overrunSeconds,
    actualMinutes: Math.floor(elapsedSeconds / 60),
    fraction: plannedSeconds === 0 ? 1 : Math.min(1, elapsedSeconds / plannedSeconds),
    isPaused: input.status === "paused",
    isLive: isLiveFocusStatus(input.status),
    reachedPlanned: plannedSeconds > 0 && elapsedSeconds >= plannedSeconds,
  };
}

/**
 * Paused time inside `[startedAt, horizon]`. An open pause (no `resumed_at`)
 * runs to the horizon. Spans are summed, not merged: `focus_pauses_open_uniq`
 * guarantees they never overlap.
 */
function pausedSecondsWithin(
  pauses: readonly FocusPauseSpan[],
  startedAt: Instant,
  horizon: Instant,
): number {
  let total = 0;
  for (const pause of pauses) {
    const from = later(pause.pausedAt, startedAt);
    const to = earlier(pause.resumedAt ?? horizon, horizon);
    total += Math.max(0, durationSeconds(from, to));
  }
  return total;
}

// `Instant` is canonical fixed-width ISO-8601 UTC, so string order is chronological order.
function later(a: Instant, b: Instant): Instant {
  return a >= b ? a : b;
}

function earlier(a: Instant, b: Instant): Instant {
  return a <= b ? a : b;
}
