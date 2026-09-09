import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { instant } from "@momentum/core/time";
import type { Instant } from "@momentum/core/types";

import { useFocusTimer } from "@/features/focus/use-focus-timer";

/**
 * The maths is `packages/core/src/focus/timer.test.ts`. These tests drive the
 * wall clock without firing intervals, which is what a throttled tab looks like.
 */

const STARTED_AT = instant("2026-09-07T09:00:00.000Z");
const SERVER_NOW = instant("2026-09-07T09:00:00.000Z");

const STARTED_EPOCH = Date.parse(STARTED_AT);

function Probe({
  serverNow = SERVER_NOW,
  pauses = [],
  status = "running" as const,
  endedAt = null as Instant | null,
  startedAt = STARTED_AT,
  onPlannedTimeElapsed,
}: {
  serverNow?: Instant;
  pauses?: { pausedAt: Instant; resumedAt: Instant | null }[];
  status?: "running" | "paused" | "completed" | "abandoned";
  endedAt?: Instant | null;
  startedAt?: Instant;
  onPlannedTimeElapsed?: () => void;
}) {
  const { state } = useFocusTimer({
    session: { plannedMinutes: 25, startedAt, endedAt, status, pauses },
    serverNow,
    onPlannedTimeElapsed,
  });

  return (
    <div>
      <span data-testid="remaining">{state?.remainingSeconds ?? -1}</span>
      <span data-testid="elapsed">{state?.elapsedSeconds ?? -1}</span>
      <span data-testid="paused">{state?.pausedSeconds ?? -1}</span>
    </div>
  );
}

function remaining(): number {
  return Number(screen.getByTestId("remaining").textContent);
}

function elapsed(): number {
  return Number(screen.getByTestId("elapsed").textContent);
}

/** Moves the wall clock without firing intervals (`vi.advanceTimersByTime` would fire them). */
function wallClock(ms: number): void {
  vi.setSystemTime(STARTED_EPOCH + ms);
}

/** What a tab coming back to the foreground does. Fires no timers. */
function returnToForeground(): void {
  window.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  wallClock(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useFocusTimer", () => {
  it("renders the full remaining time on the first frame", () => {
    render(<Probe />);
    expect(remaining()).toBe(25 * 60);
  });

  it("ticks down as the intervals fire", () => {
    render(<Probe />);

    // The ordinary case: the tab is visible and the interval runs.
    act(() => {
      vi.advanceTimersByTime(3_000);
    });

    expect(remaining()).toBe(25 * 60 - 3);
  });

  it("is correct after five minutes in which no interval fired at all", () => {
    render(<Probe />);

    // The tab was backgrounded: the clock moved, the timers did not.
    act(() => {
      wallClock(5 * 60_000);
      returnToForeground();
    });

    expect(elapsed()).toBe(5 * 60);
    expect(remaining()).toBe(20 * 60);
  });

  it("is correct on the way back from sleep, before any interval fires", () => {
    render(<Probe />);

    act(() => {
      // Two hours asleep, past the planned length.
      wallClock(2 * 3_600_000);
      returnToForeground();
    });

    expect(elapsed()).toBe(2 * 3_600);
    expect(remaining()).toBe(0);
  });

  it("recomputes on window focus and on a bfcache restore", () => {
    render(<Probe />);

    act(() => {
      wallClock(90_000);
      window.dispatchEvent(new Event("focus"));
    });
    expect(elapsed()).toBe(90);

    act(() => {
      wallClock(150_000);
      window.dispatchEvent(new Event("pageshow"));
    });
    expect(elapsed()).toBe(150);
  });

  it("starts a reloaded page at the elapsed time, not at zero", () => {
    // A fresh mount ten minutes in: the process is new, the timestamps are not.
    wallClock(10 * 60_000);
    render(<Probe serverNow={instant("2026-09-07T09:10:00.000Z")} />);

    expect(elapsed()).toBe(10 * 60);
    expect(remaining()).toBe(15 * 60);
  });

  it("holds still while the session is paused", () => {
    // Mounted twenty minutes in, fifteen of them paused.
    wallClock(20 * 60_000);
    render(
      <Probe
        serverNow={instant("2026-09-07T09:20:00.000Z")}
        status="paused"
        pauses={[{ pausedAt: instant("2026-09-07T09:05:00.000Z"), resumedAt: null }]}
      />,
    );

    expect(elapsed()).toBe(5 * 60);

    // However much time passes, an open pause absorbs all of it.
    act(() => {
      vi.advanceTimersByTime(20 * 60_000);
      returnToForeground();
    });

    expect(elapsed()).toBe(5 * 60);
    expect(remaining()).toBe(20 * 60);
  });

  it("resumes from where it stopped", () => {
    wallClock(35 * 60_000);
    const { rerender } = render(
      <Probe
        serverNow={instant("2026-09-07T09:35:00.000Z")}
        status="paused"
        pauses={[{ pausedAt: instant("2026-09-07T09:05:00.000Z"), resumedAt: null }]}
      />,
    );

    rerender(
      <Probe
        status="running"
        pauses={[
          {
            pausedAt: instant("2026-09-07T09:05:00.000Z"),
            resumedAt: instant("2026-09-07T09:35:00.000Z"),
          },
        ]}
      />,
    );
    act(() => {
      returnToForeground();
    });

    // 35 minutes of wall time, 30 of them paused.
    expect(elapsed()).toBe(5 * 60);
  });

  it("corrects a device clock that is four minutes fast", () => {
    // The server says 09:00; this device thinks it is 09:04.
    wallClock(4 * 60_000);
    render(<Probe serverNow={SERVER_NOW} />);

    // Without the correction this would read four minutes elapsed.
    expect(elapsed()).toBe(0);
    expect(remaining()).toBe(25 * 60);

    act(() => {
      wallClock(4 * 60_000 + 30_000);
      returnToForeground();
    });
    expect(elapsed()).toBe(30);
  });

  it("freezes a finished session and stops ticking it", () => {
    render(<Probe status="completed" endedAt={instant("2026-09-07T09:25:00.000Z")} />);

    act(() => {
      wallClock(10 * 3_600_000);
      vi.advanceTimersByTime(10_000);
    });

    expect(elapsed()).toBe(25 * 60);
  });
});

describe("the planned time elapsing", () => {
  it("is reported once, when the countdown crosses zero", () => {
    const elapsed = vi.fn();
    render(<Probe onPlannedTimeElapsed={elapsed} />);

    act(() => {
      vi.advanceTimersByTime(24 * 60_000 + 59_000);
    });
    expect(elapsed).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(elapsed).toHaveBeenCalledTimes(1);

    // Overrunning is not crossing again.
    act(() => {
      vi.advanceTimersByTime(10 * 60_000);
    });
    expect(elapsed).toHaveBeenCalledTimes(1);
  });

  it("is reported when a throttled tab comes back already past the length", () => {
    const elapsed = vi.fn();
    render(<Probe onPlannedTimeElapsed={elapsed} />);

    act(() => {
      wallClock(40 * 60_000);
      returnToForeground();
    });

    expect(elapsed).toHaveBeenCalledTimes(1);
  });

  it("is not reported for a page mounted on a session already past its length", () => {
    const elapsed = vi.fn();
    wallClock(30 * 60_000);
    render(
      <Probe serverNow={instant("2026-09-07T09:30:00.000Z")} onPlannedTimeElapsed={elapsed} />,
    );

    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(elapsed).not.toHaveBeenCalled();
  });

  it("is reported again for the next session", () => {
    const elapsed = vi.fn();
    const { rerender } = render(<Probe onPlannedTimeElapsed={elapsed} />);

    act(() => {
      vi.advanceTimersByTime(25 * 60_000);
    });
    expect(elapsed).toHaveBeenCalledTimes(1);

    // A new session, started at the moment the first one ran out.
    rerender(
      <Probe startedAt={instant("2026-09-07T09:25:00.000Z")} onPlannedTimeElapsed={elapsed} />,
    );
    act(() => {
      vi.advanceTimersByTime(25 * 60_000);
    });

    expect(elapsed).toHaveBeenCalledTimes(2);
  });
});
