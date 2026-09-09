import { describe, expect, it } from "vitest";

import { localTime } from "./scalars";
import { formatMinutesOfDay } from "./format";
import { localTimeOfMinutes, minutesOfLocalTime, minutesOfLocalTimeValue } from "./wall-clock";

describe("minutesOfLocalTimeValue", () => {
  it("reads a wall-clock time as minutes from midnight", () => {
    expect(minutesOfLocalTimeValue("00:00")).toBe(0);
    expect(minutesOfLocalTimeValue("09:30")).toBe(570);
    expect(minutesOfLocalTimeValue("23:59")).toBe(1439);
  });

  it("accepts the seconds a time input may include and ignores them", () => {
    expect(minutesOfLocalTimeValue("09:30:00")).toBe(570);
  });

  it("answers null for the half-typed and empty states a form field really has", () => {
    for (const value of ["", "  ", "9:30", "0930", "24:00", "09:60", "noon", "09:"]) {
      expect(minutesOfLocalTimeValue(value)).toBeNull();
    }
  });

  it("tolerates surrounding whitespace", () => {
    expect(minutesOfLocalTimeValue(" 07:05 ")).toBe(425);
  });
});

describe("minutesOfLocalTime", () => {
  it("is the total version, for a value already known to be one", () => {
    expect(minutesOfLocalTime(localTime("16:45"))).toBe(1005);
  });
});

describe("localTimeOfMinutes", () => {
  it("renders minutes from midnight as HH:MM", () => {
    expect(localTimeOfMinutes(0)).toBe("00:00");
    expect(localTimeOfMinutes(570)).toBe("09:30");
    expect(localTimeOfMinutes(1439)).toBe("23:59");
  });

  it("wraps the grid's bottom edge to midnight rather than a 25th hour", () => {
    expect(localTimeOfMinutes(1440)).toBe("00:00");
  });

  it("wraps a span that crossed midnight back onto the clock", () => {
    // 23:30 + 60 minutes is 1470 past its own midnight, and reads 00:30.
    expect(localTimeOfMinutes(1470)).toBe("00:30");
  });

  it("wraps a negative coordinate, which a drag above the grid can produce", () => {
    expect(localTimeOfMinutes(-30)).toBe("23:30");
  });

  it("round-trips with the parser across every minute of a day", () => {
    for (let minutes = 0; minutes < 1440; minutes += 1) {
      expect(minutesOfLocalTimeValue(localTimeOfMinutes(minutes))).toBe(minutes);
    }
  });

  it("agrees with formatMinutesOfDay, so a field and a label never disagree", () => {
    for (const minutes of [0, 1, 570, 719, 720, 1439, 1440]) {
      expect(localTimeOfMinutes(minutes)).toBe(formatMinutesOfDay(minutes));
    }
  });
});
