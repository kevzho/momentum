import { describe, expect, it } from "vitest";

import { ianaTimeZone, isIanaTimeZone } from "@momentum/core/time";

import { timeZoneOptions } from "@/features/settings/timezones";

describe("timeZoneOptions", () => {
  it("offers the whole tz database, not a short list", () => {
    const options = timeZoneOptions(ianaTimeZone("America/New_York"));

    expect(options.length).toBeGreaterThan(300);
    for (const zone of ["Pacific/Auckland", "Europe/Berlin", "Asia/Tokyo", "Africa/Lagos"]) {
      expect(options).toContain(zone);
    }
  });

  it("puts the profile's own zone first and never repeats it", () => {
    const options = timeZoneOptions(ianaTimeZone("Pacific/Auckland"));

    expect(options[0]).toBe("Pacific/Auckland");
    expect(options.filter((zone) => zone === "Pacific/Auckland")).toHaveLength(1);
  });

  it("always includes UTC, the product's fallback", () => {
    expect(timeZoneOptions(ianaTimeZone("Europe/London"))).toContain("UTC");
  });

  it("offers only zones the server-side validator accepts", () => {
    const options = timeZoneOptions(ianaTimeZone("UTC"));

    expect(options.every((zone) => isIanaTimeZone(zone))).toBe(true);
  });
});
