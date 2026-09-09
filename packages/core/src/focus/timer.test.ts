import { describe, expect, it } from "vitest";

import { instant } from "../time/scalars";
import { addMinutes } from "../time/duration";
import type { Instant } from "../types/scalars";
import { focusTimerState, isLiveFocusStatus, type FocusPauseSpan } from "./timer";

/**
 * The property this whole file exists for: **the answer is a function of the
 * timestamps and `now`, and of nothing else.** No test here calls the timer
 * repeatedly to "advance" it, because advancing is not a thing it does. Each
 * case states a start, some pauses and an instant, and asserts the number.
 *
 * The three failures `specs/07-focus-mode.md` calls out — a backgrounded tab,
 * a reloaded page, a slept machine — are all the same shape from this module's
 * point of view: nobody called it for a while, and then somebody did. They are
 * asserted explicitly anyway, because "the same shape" is the claim being made.
 */

const START = instant("2026-09-07T09:00:00.000Z");

function at(minutes: number, seconds = 0): Instant {
  return instant(new Date(Date.parse(START) + minutes * 60_000 + seconds * 1_000).toISOString());
}

function running(pauses: FocusPauseSpan[] = [], plannedMinutes = 25) {
  return {
    plannedMinutes,
    startedAt: START,
    endedAt: null,
    status: "running" as const,
    pauses,
  };
}

describe("focusTimerState — elapsed time is derived, never counted", () => {
  it("is all zero at the instant the session starts", () => {
    const state = focusTimerState(running(), START);

    expect(state.elapsedSeconds).toBe(0);
    expect(state.remainingSeconds).toBe(25 * 60);
    expect(state.actualMinutes).toBe(0);
    expect(state.fraction).toBe(0);
  });

  it("derives elapsed and remaining from the gap between the two timestamps", () => {
    const state = focusTimerState(running(), at(7, 30));

    expect(state.elapsedSeconds).toBe(450);
    expect(state.remainingSeconds).toBe(25 * 60 - 450);
    expect(state.actualMinutes).toBe(7);
  });

  it("truncates seconds rather than rounding them, so the minute count never runs ahead", () => {
    expect(focusTimerState(running(), at(6, 59)).actualMinutes).toBe(6);
    expect(focusTimerState(running(), at(7, 0)).actualMinutes).toBe(7);
  });

  /*
   * The three scenarios the spec names. A throttled tab and a slept machine
   * differ only in how long nobody asked; a reload differs only in that the
   * asking process is new. All three reduce to one call with a distant `now`,
   * and the answer is the full elapsed time — not the number of intervals that
   * happened to fire.
   */
  it("is correct after a tab has been backgrounded for five minutes", () => {
    const backgrounded = focusTimerState(running(), at(2));
    const foregrounded = focusTimerState(running(), at(7));

    expect(backgrounded.elapsedSeconds).toBe(120);
    expect(foregrounded.elapsedSeconds).toBe(420);
  });

  it("is correct on a page reloaded mid-session", () => {
    // A fresh process knows only what the database persisted.
    const rehydrated = focusTimerState(running(), at(12, 34));

    expect(rehydrated.elapsedSeconds).toBe(754);
    expect(rehydrated.remainingSeconds).toBe(25 * 60 - 754);
  });

  it("is correct after the machine has slept past the planned length", () => {
    const state = focusTimerState(running(), at(90));

    expect(state.elapsedSeconds).toBe(90 * 60);
    expect(state.remainingSeconds).toBe(0);
    expect(state.overrunSeconds).toBe(65 * 60);
    expect(state.reachedPlanned).toBe(true);
    expect(state.fraction).toBe(1);
  });

  it("clamps a local clock that is behind the database's instead of rendering the skew", () => {
    const behind = instant(new Date(Date.parse(START) - 30_000).toISOString());
    const state = focusTimerState(running(), behind);

    expect(state.elapsedSeconds).toBe(0);
    expect(state.remainingSeconds).toBe(25 * 60);
  });

  it("freezes a finished session at its own end, however long ago that was", () => {
    const finished = {
      ...running(),
      status: "completed" as const,
      endedAt: at(25),
    };

    expect(focusTimerState(finished, at(25)).elapsedSeconds).toBe(1500);
    expect(focusTimerState(finished, at(600)).elapsedSeconds).toBe(1500);
    expect(focusTimerState(finished, at(600)).isLive).toBe(false);
  });
});

describe("focusTimerState — pause and resume", () => {
  it("excludes a closed pause from elapsed time", () => {
    const pauses = [{ pausedAt: at(5), resumedAt: at(8) }];
    const state = focusTimerState(running(pauses), at(10));

    expect(state.pausedSeconds).toBe(180);
    expect(state.elapsedSeconds).toBe(7 * 60);
    expect(state.remainingSeconds).toBe(18 * 60);
  });

  it("holds elapsed time still while the session is paused", () => {
    const pauses = [{ pausedAt: at(5), resumedAt: null }];
    const paused = { ...running(pauses), status: "paused" as const };

    // Two readings a quarter of an hour apart, and the same answer.
    expect(focusTimerState(paused, at(6)).elapsedSeconds).toBe(300);
    expect(focusTimerState(paused, at(21)).elapsedSeconds).toBe(300);
    expect(focusTimerState(paused, at(21)).isPaused).toBe(true);
  });

  it("resumes from where it stopped, not from where the wall clock got to", () => {
    const pauses = [{ pausedAt: at(5), resumedAt: at(35) }];
    const state = focusTimerState(running(pauses), at(40));

    // 40 minutes of wall time, 30 of them paused.
    expect(state.elapsedSeconds).toBe(10 * 60);
    expect(state.actualMinutes).toBe(10);
  });

  it("subtracts several pauses", () => {
    const pauses = [
      { pausedAt: at(5), resumedAt: at(6) },
      { pausedAt: at(10), resumedAt: at(12, 30) },
      { pausedAt: at(20), resumedAt: at(21) },
    ];
    const state = focusTimerState(running(pauses), at(30));

    expect(state.pausedSeconds).toBe(60 + 150 + 60);
    expect(state.elapsedSeconds).toBe(30 * 60 - 270);
  });

  it("counts a pause that is still open at the moment a session ends, and no further", () => {
    const finished = {
      ...running([{ pausedAt: at(10), resumedAt: null }]),
      status: "completed" as const,
      endedAt: at(15),
    };
    const state = focusTimerState(finished, at(400));

    expect(state.pausedSeconds).toBe(5 * 60);
    expect(state.elapsedSeconds).toBe(10 * 60);
  });

  it("clips a pause row that begins before the session or ends after it", () => {
    const pauses = [
      { pausedAt: addMinutes(START, -10), resumedAt: at(2) },
      { pausedAt: at(8), resumedAt: at(99) },
    ];
    const state = focusTimerState(running(pauses), at(10));

    // The first contributes its two minutes inside the session, not twelve;
    // the second contributes two, not ninety-one.
    expect(state.pausedSeconds).toBe(4 * 60);
    expect(state.elapsedSeconds).toBe(6 * 60);
  });

  it("never reports negative elapsed time, whatever the rows say", () => {
    const pauses = [{ pausedAt: START, resumedAt: at(500) }];
    const state = focusTimerState(running(pauses), at(10));

    expect(state.elapsedSeconds).toBe(0);
    expect(state.remainingSeconds).toBe(25 * 60);
  });
});

describe("focusTimerState — the ring", () => {
  it("reports the fraction of the planned length that has elapsed", () => {
    expect(focusTimerState(running([], 50), at(25)).fraction).toBeCloseTo(0.5, 10);
  });

  it("clamps the fraction at one and keeps counting the overrun separately", () => {
    const state = focusTimerState(running([], 50), at(75));

    expect(state.fraction).toBe(1);
    expect(state.overrunSeconds).toBe(25 * 60);
  });
});

describe("isLiveFocusStatus", () => {
  it("is true for the two statuses a user can still act on", () => {
    expect(isLiveFocusStatus("running")).toBe(true);
    expect(isLiveFocusStatus("paused")).toBe(true);
    expect(isLiveFocusStatus("completed")).toBe(false);
    expect(isLiveFocusStatus("abandoned")).toBe(false);
  });
});
