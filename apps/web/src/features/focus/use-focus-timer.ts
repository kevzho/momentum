"use client";

import * as React from "react";

import { focusTimerState, type FocusTimerInput, type FocusTimerState } from "@momentum/core/focus";
import { clockOffsetMs, nowInstant, offsetClock } from "@momentum/core/time";
import type { Instant } from "@momentum/core/types";

/**
 * The timer's rendering loop. The maths lives in `packages/core/src/focus/timer.ts`
 * and is recomputed from timestamps on every tick, so there is no counter to
 * fall behind: a throttled tab, a reload or a slept machine is right on its
 * next reading. The device clock is corrected once against `serverNow`.
 */
const TICK_MS = 1_000;

export interface UseFocusTimerInput {
  /** Null when there is no live session; the hook then does no work at all. */
  session: FocusTimerInput | null;
  /** The instant the server rendered at, from the page's payload. */
  serverNow: Instant;
  /**
   * Called once per session, the first time a running countdown is seen at
   * zero after having been seen above it. A page mounted on a session already
   * past its length is not a crossing, and does not call it.
   */
  onPlannedTimeElapsed?: () => void;
}

export interface UseFocusTimer {
  /** Null when there is no session. */
  state: FocusTimerState | null;
  /** The corrected clock, for anything else on the page that needs "now". */
  now: Instant;
}

export function useFocusTimer({
  session,
  serverNow,
  onPlannedTimeElapsed,
}: UseFocusTimerInput): UseFocusTimer {
  // Measured once, before first paint: re-measuring per render would fold render
  // time into the correction, and an effect would leave the first paint uncorrected.
  const [offsetMs] = React.useState(() => clockOffsetMs(serverNow, nowInstant()));
  const clock = React.useMemo(() => offsetClock(offsetMs), [offsetMs]);

  const [now, setNow] = React.useState<Instant>(() => nowInstant(clock));

  // Derived flags, not `session` itself: the payload is rebuilt on every server
  // render, and depending on the object would restart the interval each revalidation.
  const live = session !== null && session.endedAt === null;
  const paused = session?.status === "paused";

  React.useEffect(() => {
    if (!live) return;

    const read = () => setNow(nowInstant(clock));

    // Immediately, so a return from sleep does not wait a second.
    read();

    // A paused session has nothing to tick; only the visibility listeners stay,
    // because the resume may happen in another tab.
    const interval = paused ? null : window.setInterval(read, TICK_MS);

    // All three are needed: `pageshow` (back/forward cache) fires neither of the others.
    window.addEventListener("visibilitychange", read);
    window.addEventListener("focus", read);
    window.addEventListener("pageshow", read);

    return () => {
      if (interval !== null) window.clearInterval(interval);
      window.removeEventListener("visibilitychange", read);
      window.removeEventListener("focus", read);
      window.removeEventListener("pageshow", read);
    };
  }, [clock, live, paused]);

  const state = session === null ? null : focusTimerState(session, now);

  // A throttled tab may go from "ten minutes left" to "past" in one reading and
  // must still count as a crossing. The callback is read through a ref so an
  // inline function at the call site does not re-run the effect.
  const elapsedCallback = React.useRef(onPlannedTimeElapsed);
  React.useEffect(() => {
    elapsedCallback.current = onPlannedTimeElapsed;
  }, [onPlannedTimeElapsed]);

  const startedAt = session?.startedAt;
  const remainingSeconds = state?.remainingSeconds;
  const lastSeen = React.useRef<{ startedAt: Instant | undefined; remaining: number | undefined }>({
    startedAt: undefined,
    remaining: undefined,
  });

  React.useEffect(() => {
    const previous = lastSeen.current;
    lastSeen.current = { startedAt, remaining: remainingSeconds };

    const sameSession = previous.startedAt === startedAt;
    const crossed =
      sameSession &&
      previous.remaining !== undefined &&
      previous.remaining > 0 &&
      remainingSeconds === 0;

    if (live && !paused && crossed) elapsedCallback.current?.();
  }, [live, paused, startedAt, remainingSeconds]);

  return { state, now };
}
