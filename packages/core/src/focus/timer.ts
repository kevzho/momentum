import type { Instant, Minutes } from "../types/scalars";
import type { FocusSessionStatus } from "../types/focus";
import { durationSeconds } from "../time/duration";

/**
 * The timer, as arithmetic over persisted timestamps.
 *
 * This module is the answer to the one thing `specs/07-focus-mode.md` says is
 * easy to get wrong. **Nothing here counts.** There is no decrementing
 * counter, no accumulated tick total, and no state that a missed interval
 * could leave behind: every number is recomputed from `startedAt`, the pause
 * records and the instant it is asked about. A tab throttled to one timer a
 * minute, a machine asleep for an hour and a page reloaded mid-session all
 * produce the same answer as a tab that ticked every second, because the
 * answer never depended on the ticking. The interval in the UI decides how
 * often this function is called; it does not contribute to what it returns.
 *
 * Every timestamp it reads was stamped by the database (Domain Rule 15), so
 * the only untrusted input is `now` — and the only thing `now` can do is make
 * the *display* wrong, never the recorded duration, which `finish_focus_session`
 * computes from the same rows with the database's own clock.
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
  /**
   * The minutes this session would record if it finished now. Truncated, which
   * is what `finish_focus_session` does with the same interval — so the number
   * on screen is the number that will be written, not a rounded neighbour.
   */
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
 * The whole timer.
 *
 * The horizon is `endedAt` for a session that has finished and `now` for one
 * that has not, so a completed session's numbers are frozen and asking again
 * an hour later returns the same answer.
 *
 * `now` is clamped up to `startedAt`. The session's start is the database's
 * clock and `now` is usually the browser's; a browser a few seconds behind
 * would otherwise produce a negative elapsed time and a timer that reads more
 * than its own planned length for the first few seconds. Clamping states the
 * only thing that is certainly true — a session cannot have run for less than
 * no time — instead of rendering the skew.
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
 * Paused time inside the session's own span.
 *
 * Each pause is clipped to `[startedAt, horizon]` before it is counted, which
 * is what makes an *open* pause work: a session paused twenty minutes ago has
 * no `resumed_at`, and its pause runs to the horizon — so the elapsed time
 * stops advancing while the session is paused, and starts again from where it
 * stopped when the resume is recorded (Domain Rule 3: paused time is not time
 * spent).
 *
 * A session can be paused or running but not both, so the spans the database
 * produces never overlap (`focus_pauses_open_uniq` holds the invariant from
 * the other side). They are summed rather than merged, and the clipping means
 * a row from outside the span contributes nothing rather than a negative.
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

/*
 * `Instant` is canonical ISO-8601 UTC with a fixed number of digits, so string
 * order is chronological order. Comparing them directly keeps this module free
 * of epoch arithmetic, which lives behind `@momentum/core/time` on purpose.
 */
function later(a: Instant, b: Instant): Instant {
  return a >= b ? a : b;
}

function earlier(a: Instant, b: Instant): Instant {
  return a <= b ? a : b;
}
