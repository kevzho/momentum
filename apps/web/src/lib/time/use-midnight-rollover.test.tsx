import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ianaTimeZone, nowInstant, todayIn } from "@momentum/core/time";

/**
 * The rollover that makes `/today` become tomorrow's page.
 *
 * "Today" is resolved once per request, on the server, in the profile timezone
 * (Domain Rule 4). That is right at render time and wrong for a tab left open
 * overnight, so one timer to the next local midnight followed by
 * `router.refresh()` is what keeps the two in step — with no second source of
 * truth for what day it is.
 *
 * The suite drives the *wall clock* rather than the interval, because the
 * failure this guards against is a hardcoded 24 hours: on the two days a year a
 * zone moves its clock, the wait is 23 or 25 hours, and a fixed day would fire
 * an hour early or an hour late. It pins the timezone rather than reading the
 * host's, for the reason the whole `time` module does.
 */

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
}));

const { useMidnightRollover } = await import("@/lib/time/use-midnight-rollover");

const NEW_YORK = ianaTimeZone("America/New_York");

function Probe() {
  useMidnightRollover(NEW_YORK);
  return null;
}

/**
 * A UTC reading as epoch milliseconds, for `vi.setSystemTime`.
 *
 * `Date.parse` rather than `new Date(...)`: constructing a date in a `.tsx`
 * file is the ad-hoc date arithmetic Domain Rule 5 forbids, and the rule is
 * lint-enforced. Pinning a clock is not date arithmetic, but the exception is
 * not worth carving into a rule that has caught real defects.
 */
function epochOf(iso: string): number {
  return Date.parse(iso);
}

/** Wall-clock hours as milliseconds, for advancing the fake clock. */
function hours(n: number): number {
  return n * 60 * 60 * 1000;
}

beforeEach(() => {
  refresh.mockClear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useMidnightRollover", () => {
  it("refreshes at the user's local midnight, not the host's", () => {
    // 22:00 in New York on 2026-09-08 — and already 2026-09-09 in UTC, which is
    // the case a server-timezone implementation gets wrong.
    vi.setSystemTime(epochOf("2026-09-09T02:00:00.000Z"));
    render(<Probe />);

    vi.advanceTimersByTime(hours(1) + 59 * 60 * 1000);
    expect(refresh).not.toHaveBeenCalled();

    // Two hours plus the second of slack the hook adds.
    vi.advanceTimersByTime(60 * 1000 + 2000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("re-arms, so a tab open for days keeps working", () => {
    vi.setSystemTime(epochOf("2026-09-09T02:00:00.000Z"));
    render(<Probe />);

    vi.advanceTimersByTime(hours(2) + 2000);
    expect(refresh).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(hours(24) + 2000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  /**
   * 2026-03-08 is New York's spring-forward day: the clock goes 02:00 → 03:00,
   * so the local day is 23 hours long. A hook that waited a fixed 24 hours
   * would refresh an hour into the *next* day and leave the page showing the
   * wrong date for an hour.
   */
  it("waits 23 hours across a spring-forward day", () => {
    // 00:30 local on the transition day.
    vi.setSystemTime(epochOf("2026-03-08T05:30:00.000Z"));
    render(<Probe />);

    // 23:30 elapsed would be 00:00 on a normal day; here it is 00:30 on the
    // next date already, so the refresh must have happened before it.
    vi.advanceTimersByTime(hours(22) + 30 * 60 * 1000 + 2000);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(todayIn(NEW_YORK, nowInstant())).toBe("2026-03-09");
  });

  /**
   * 2026-11-01 is the fall-back day: 01:00 happens twice and the local day is
   * 25 hours long. A fixed 24 hours would refresh an hour early, while it was
   * still the same date, and the page would not move at the boundary at all.
   */
  it("waits 25 hours across a fall-back day", () => {
    // 00:30 local on the transition day, on the pre-transition offset.
    vi.setSystemTime(epochOf("2026-11-01T04:30:00.000Z"));
    render(<Probe />);

    vi.advanceTimersByTime(hours(24) + 2000);
    expect(refresh).not.toHaveBeenCalled();
    expect(todayIn(NEW_YORK, nowInstant())).toBe("2026-11-01");

    vi.advanceTimersByTime(hours(1));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
