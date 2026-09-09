import { describe, expect, it } from "vitest";

import { clockOffsetMs, nowInstant, offsetClock } from "./clock";
import { instant, isInstant } from "./scalars";

describe("nowInstant", () => {
  it("reads the injected clock rather than the wall clock", () => {
    const fixed = Date.UTC(2026, 8, 7, 14, 30, 0);
    expect(nowInstant(() => fixed)).toBe("2026-09-07T14:30:00.000Z");
  });

  it("defaults to Date.now", () => {
    const before = Date.now();
    const value = nowInstant();
    expect(isInstant(value)).toBe(true);
    expect(Date.parse(value)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(value)).toBeLessThanOrEqual(Date.now());
  });

  it("keeps millisecond precision", () => {
    expect(nowInstant(() => Date.UTC(2026, 0, 1, 0, 0, 0) + 123)).toBe("2026-01-01T00:00:00.123Z");
  });

  it("rejects a clock that returns something unusable", () => {
    expect(() => nowInstant(() => Number.NaN)).toThrow(TypeError);
  });
});

describe("clockOffsetMs / offsetClock", () => {
  it("is zero when the two clocks agree", () => {
    const now = instant("2026-09-07T09:00:00.000Z");
    expect(clockOffsetMs(now, now)).toBe(0);
  });

  it("is positive when the local clock is behind the server's", () => {
    const offset = clockOffsetMs(
      instant("2026-09-07T09:00:00.000Z"),
      instant("2026-09-07T08:58:00.000Z"),
    );
    expect(offset).toBe(120_000);
  });

  it("is negative when the local clock is ahead", () => {
    const offset = clockOffsetMs(
      instant("2026-09-07T09:00:00.000Z"),
      instant("2026-09-07T09:00:30.000Z"),
    );
    expect(offset).toBe(-30_000);
  });

  it("corrects a wrong local clock through nowInstant", () => {
    const wrong = () => Date.parse("2026-09-07T08:58:00.000Z");
    const offset = clockOffsetMs(instant("2026-09-07T09:00:00.000Z"), nowInstant(wrong));

    expect(nowInstant(offsetClock(offset, wrong))).toBe("2026-09-07T09:00:00.000Z");
  });
});
