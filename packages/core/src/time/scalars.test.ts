import { describe, expect, it } from "vitest";

import {
  ianaTimeZone,
  instant,
  isIanaTimeZone,
  isInstant,
  isLocalDate,
  localDate,
  localTime,
} from "./scalars";

describe("instant", () => {
  it("normalises every UTC spelling Postgres produces to one canonical form", () => {
    const expected = "2026-09-07T14:00:00.000Z";
    expect(instant("2026-09-07T14:00:00+00:00")).toBe(expected);
    expect(instant("2026-09-07T14:00:00Z")).toBe(expected);
    expect(instant("2026-09-07 14:00:00+00")).toBe(expected);
    expect(instant("2026-09-07T14:00:00.000Z")).toBe(expected);
  });

  it("truncates sub-millisecond precision rather than rounding it forward", () => {
    expect(instant("2026-09-07T14:00:00.123456+00:00")).toBe("2026-09-07T14:00:00.123Z");
    expect(instant("2026-09-07T14:00:00.999999Z")).toBe("2026-09-07T14:00:00.999Z");
  });

  it("pads a short fraction to milliseconds", () => {
    expect(instant("2026-09-07T14:00:00.5Z")).toBe("2026-09-07T14:00:00.500Z");
  });

  it("converts a non-UTC offset to UTC", () => {
    expect(instant("2026-09-07T10:00:00-04:00")).toBe("2026-09-07T14:00:00.000Z");
    expect(instant("2026-09-07T19:30:00+05:30")).toBe("2026-09-07T14:00:00.000Z");
  });

  it("rejects anything that is not an instant", () => {
    expect(() => instant("2026-09-07")).toThrow(TypeError);
    expect(() => instant("14:00")).toThrow(TypeError);
    expect(() => instant("")).toThrow(TypeError);
    expect(isInstant("2026-09-07T14:00:00")).toBe(false);
  });
});

describe("localDate", () => {
  it("accepts a real calendar date", () => {
    expect(localDate("2026-02-28")).toBe("2026-02-28");
    expect(localDate("2028-02-29")).toBe("2028-02-29");
  });

  it("rejects a date that does not exist", () => {
    expect(isLocalDate("2026-02-29")).toBe(false);
    expect(isLocalDate("2026-13-01")).toBe(false);
    expect(() => localDate("2026-09-07T00:00:00Z")).toThrow(TypeError);
  });
});

describe("localTime", () => {
  it("drops the seconds Postgres adds to a time column", () => {
    expect(localTime("09:00:00")).toBe("09:00");
    expect(localTime("23:59")).toBe("23:59");
  });

  it("rejects an impossible clock reading", () => {
    expect(() => localTime("24:00")).toThrow(TypeError);
    expect(() => localTime("9:00")).toThrow(TypeError);
  });
});

describe("ianaTimeZone", () => {
  it("accepts identifiers the runtime knows", () => {
    expect(ianaTimeZone("America/New_York")).toBe("America/New_York");
    expect(ianaTimeZone("UTC")).toBe("UTC");
  });

  it("rejects an invented one", () => {
    expect(isIanaTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(isIanaTimeZone("")).toBe(false);
    expect(() => ianaTimeZone("not a zone")).toThrow(TypeError);
  });
});
