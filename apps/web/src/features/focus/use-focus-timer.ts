"use client";

import * as React from "react";

import { focusTimerState, type FocusTimerInput, type FocusTimerState } from "@momentum/core/focus";
import { clockOffsetMs, nowInstant, offsetClock } from "@momentum/core/time";
import type { Instant } from "@momentum/core/types";

/**
 * The timer's *rendering* loop.
 *
 * Read `packages/core/src/focus/timer.ts` first: that is where a session's
 * elapsed and remaining time are decided, from `started_at`, the pause records
 * and an instant. This hook does one job — decide how often to ask — and it is
 * written so that being asked late, or not at all for an hour, changes nothing
 * about the answer.
 *
 * That is the whole of the design `specs/07-focus-mode.md` insists on. There is
 * no counter here to decrement and no accumulated total to fall behind:
 *
 * - **A backgrounded tab** is throttled to about one timer a minute, and in
 *   some browsers to none. The next tick, whenever it comes, recomputes from
 *   the timestamps and is correct.
 * - **A reloaded page** starts this hook from nothing, and the first render is
 *   already right, because the server sent the same timestamps it had before.
 * - **A slept machine** fires no intervals at all. `visibilitychange`,
 *   `focus` and `pageshow` each force an immediate recomputation on the way
 *   back, so the screen is right before the next second would have arrived —
 *   and even without them the next tick would fix it.
 *
 * The clock the hook reads is the device's, corrected once against the
 * instant the server rendered at. A device whose clock is minutes out would
 * otherwise render a session minutes out — the persisted timestamps are the
 * database's, and subtracting them from an uncorrected local reading mixes two
 * clocks. The correction survives sleep, because wall-clock time keeps running
 * across it.
 */

/** One second while running. Fast enough for a countdown, cheap enough to ignore. */
const TICK_MS = 1_000;

export interface UseFocusTimerInput {
  /** Null when there is no live session; the hook then does no work at all. */
  session: FocusTimerInput | null;
  /** The instant the server rendered at, from the page's payload. */
  serverNow: Instant;
}

export interface UseFocusTimer {
  /** Null when there is no session. */
  state: FocusTimerState | null;
  /** The corrected clock, for anything else on the page that needs "now". */
  now: Instant;
}

export function useFocusTimer({ session, serverNow }: UseFocusTimerInput): UseFocusTimer {
  /*
   * Measured once, on the first client render for this payload, and then held.
   * Re-measuring on every render would fold the render's own elapsed time into
   * the correction; measuring in an effect would leave the first paint
   * uncorrected. `useState`'s initialiser runs exactly once per mount, before
   * paint, which is the moment the two readings are closest together.
   */
  const [offsetMs] = React.useState(() => clockOffsetMs(serverNow, nowInstant()));
  const clock = React.useMemo(() => offsetClock(offsetMs), [offsetMs]);

  const [now, setNow] = React.useState<Instant>(() => nowInstant(clock));

  /*
   * The session's identity, not its object identity: the payload is rebuilt on
   * every server render, so depending on `session` itself would restart the
   * interval on every revalidation.
   */
  const live = session !== null && session.endedAt === null;
  const paused = session?.status === "paused";

  React.useEffect(() => {
    if (!live) return;

    const read = () => setNow(nowInstant(clock));

    // Immediately, so a resume or a return from sleep does not wait a second.
    read();

    /*
     * A paused session's numbers cannot change — its elapsed time is frozen by
     * the open pause record — so there is nothing to tick. Only the visibility
     * listeners stay, because the *resume* that unfreezes it may happen in
     * another tab.
     */
    const interval = paused ? null : window.setInterval(read, TICK_MS);

    /*
     * Three events, because no single one covers every route back:
     * `visibilitychange` fires for a tab switch, `focus` for a window that was
     * behind another, and `pageshow` for a page restored from the back/forward
     * cache — which fires neither of the others.
     */
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

  return { state, now };
}
