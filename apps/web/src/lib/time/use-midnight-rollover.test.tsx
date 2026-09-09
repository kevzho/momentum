import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ianaTimeZone, nowInstant, todayIn } from "@momentum/core/time";

// Drives the wall clock rather than the interval: on DST days the wait to
// midnight is 23 or 25 hours, and a hardcoded 24 would fire an hour off.

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

// `Date.parse` rather than `new Date(...)`: the latter is lint-forbidden in `.tsx`.
function epochOf(iso: string): number {
  return Date.parse(iso);
}

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
    // 22:00 in New York on 2026-09-08, already 2026-09-09 in UTC.
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

  // 2026-03-08 is New York's spring-forward day: the local day is 23 hours.
  it("waits 23 hours across a spring-forward day", () => {
    // 00:30 local on the transition day.
    vi.setSystemTime(epochOf("2026-03-08T05:30:00.000Z"));
    render(<Probe />);

    // 23:30 elapsed is already 00:30 on the next date, so the refresh must have happened.
    vi.advanceTimersByTime(hours(22) + 30 * 60 * 1000 + 2000);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(todayIn(NEW_YORK, nowInstant())).toBe("2026-03-09");
  });

  // 2026-11-01 is the fall-back day: the local day is 25 hours.
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
