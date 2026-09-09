import { describe, expect, it } from "vitest";

import { addMinutes, durationMinutes, parseDuration } from "./duration";
import { ianaTimeZone, instant, localDate } from "./scalars";
import { formatDuration } from "./format";
import { fromLocal, minutesFromMidnight } from "./zone";

const NEW_YORK = ianaTimeZone("America/New_York");
const d = localDate;
const i = instant;

describe("durationMinutes", () => {
  it("measures elapsed minutes between two instants", () => {
    expect(durationMinutes(i("2026-09-07T14:00:00Z"), i("2026-09-07T15:30:00Z"))).toBe(90);
    expect(durationMinutes(i("2026-09-07T14:00:00Z"), i("2026-09-07T14:00:00Z"))).toBe(0);
  });

  it("is negative when the span is inverted", () => {
    expect(durationMinutes(i("2026-09-07T15:00:00Z"), i("2026-09-07T14:00:00Z"))).toBe(-60);
  });

  it("rounds sub-minute precision, because Minutes is a whole number", () => {
    expect(durationMinutes(i("2026-09-07T14:00:00.000Z"), i("2026-09-07T14:00:29.000Z"))).toBe(0);
    expect(durationMinutes(i("2026-09-07T14:00:00.000Z"), i("2026-09-07T14:00:31.000Z"))).toBe(1);
  });

  it("reports elapsed time, not wall-clock time, across a spring forward", () => {
    // A block placed at 02:00–03:00 local on 2026-03-08 in New York looks like
    // an hour on the grid, but 02:00 does not exist: both ends resolve to the
    // same instant and the block consumes none of the user's week. Capacity and
    // estimate-versus-actual maths need this number, not the 60 on the label.
    const start = fromLocal(d("2026-03-08"), 120, NEW_YORK);
    const end = fromLocal(d("2026-03-08"), 180, NEW_YORK);
    expect(minutesFromMidnight(start, NEW_YORK)).toBe(180);
    expect(minutesFromMidnight(end, NEW_YORK)).toBe(180);
    expect(durationMinutes(start, end)).toBe(0);
  });

  it("reports elapsed time, not wall-clock time, across a fall back", () => {
    // 01:00–02:00 local on 2026-11-01 spans the repeated hour: the label says
    // one hour, the user really spends two.
    const start = fromLocal(d("2026-11-01"), 60, NEW_YORK);
    const end = fromLocal(d("2026-11-01"), 120, NEW_YORK);
    expect(durationMinutes(start, end)).toBe(120);
  });

  it("reports 1380 and 1500 for a wall-clock day on the two transition dates", () => {
    expect(
      durationMinutes(
        fromLocal(d("2026-03-08"), 0, NEW_YORK),
        fromLocal(d("2026-03-09"), 0, NEW_YORK),
      ),
    ).toBe(1380);
    expect(
      durationMinutes(
        fromLocal(d("2026-11-01"), 0, NEW_YORK),
        fromLocal(d("2026-11-02"), 0, NEW_YORK),
      ),
    ).toBe(1500);
  });
});

describe("addMinutes", () => {
  it("shifts an instant forward and backward", () => {
    expect(addMinutes(i("2026-09-07T14:00:00Z"), 90)).toBe("2026-09-07T15:30:00.000Z");
    expect(addMinutes(i("2026-09-07T14:00:00Z"), -90)).toBe("2026-09-07T12:30:00.000Z");
    expect(addMinutes(i("2026-09-07T14:00:00Z"), 0)).toBe("2026-09-07T14:00:00.000Z");
  });

  it("crosses date boundaries", () => {
    expect(addMinutes(i("2025-12-31T23:30:00Z"), 60)).toBe("2026-01-01T00:30:00.000Z");
  });

  it("is the inverse of durationMinutes", () => {
    const start = i("2026-09-07T14:00:00.000Z");
    for (const minutes of [-1440, -15, 0, 15, 135, 1440]) {
      expect(durationMinutes(start, addMinutes(start, minutes))).toBe(minutes);
    }
  });

  it("adds elapsed minutes, so a wall-clock hour is not preserved across a transition", () => {
    // Documented so nobody reaches for addMinutes(i, 1440) to mean "same time
    // tomorrow" — on 2026-03-08 that lands an hour early.
    const before = fromLocal(d("2026-03-07"), 9 * 60, NEW_YORK);
    expect(minutesFromMidnight(addMinutes(before, 1440), NEW_YORK)).toBe(10 * 60);
    expect(minutesFromMidnight(fromLocal(d("2026-03-08"), 9 * 60, NEW_YORK), NEW_YORK)).toBe(
      9 * 60,
    );
  });
});

describe("parseDuration", () => {
  it("reads a bare number as minutes, which is what an estimate field means", () => {
    expect(parseDuration("45")).toBe(45);
    expect(parseDuration("90")).toBe(90);
    expect(parseDuration(" 30 ")).toBe(30);
  });

  it("reads the shapes people actually type", () => {
    expect(parseDuration("45m")).toBe(45);
    expect(parseDuration("1h")).toBe(60);
    expect(parseDuration("1h30m")).toBe(90);
    expect(parseDuration("1h 30m")).toBe(90);
    expect(parseDuration("1h 30")).toBe(90);
    expect(parseDuration("2:30")).toBe(150);
    expect(parseDuration("1.5h")).toBe(90);
    expect(parseDuration("90 min")).toBe(90);
    expect(parseDuration("2 hours")).toBe(120);
    expect(parseDuration("1HR")).toBe(60);
  });

  it("returns null rather than 0, so a field can tell empty from unreadable", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("   ")).toBeNull();
    expect(parseDuration("soon")).toBeNull();
    expect(parseDuration("h")).toBeNull();
    expect(parseDuration("1h2h")).toBeNull();
    expect(parseDuration("-30")).toBeNull();
    expect(parseDuration("2:75")).toBeNull();
  });

  it("round-trips with formatDuration for the values it produces", () => {
    for (const minutes of [0, 5, 45, 60, 90, 135, 1440]) {
      expect(parseDuration(formatDuration(minutes))).toBe(minutes);
    }
  });
});
