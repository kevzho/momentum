import { fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { localDate } from "@momentum/core/time";
import type { LocalDate } from "@momentum/core/types";

import { DatePicker } from "@momentum/ui/components/date-picker";

/**
 * Neither suite zone (UTC, America/Los_Angeles) has a positive offset, which
 * is where a UTC-field conversion returns the previous day — so these cases
 * move the process zone themselves.
 */
const ZONES = ["UTC", "Asia/Kolkata", "Pacific/Kiritimati", "America/Los_Angeles"];

const HOST_ZONE = process.env.TZ;

describe.each(ZONES)("DatePicker in %s", (zone) => {
  beforeAll(() => {
    process.env.TZ = zone;
  });

  afterAll(() => {
    if (HOST_ZONE === undefined) delete process.env.TZ;
    else process.env.TZ = HOST_ZONE;
  });

  it("emits the calendar day whose cell was clicked", () => {
    const chosen: (LocalDate | null)[] = [];
    render(
      <DatePicker
        value={null}
        onValueChange={(next) => chosen.push(next)}
        today={localDate("2026-09-07")}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Due date" }));
    fireEvent.click(screen.getByRole("button", { name: "Tuesday, September 15th, 2026" }));

    expect(chosen).toEqual([localDate("2026-09-15")]);
  });

  it("rings the day it was given, and the day the caller called today", () => {
    render(
      <DatePicker
        value={localDate("2026-12-15")}
        onValueChange={() => {}}
        today={localDate("2026-12-07")}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Due date" }));

    expect(
      screen.getByRole("button", { name: "Tuesday, December 15th, 2026, selected" }),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Today, Monday, December 7th, 2026" })).toBeDefined();
  });

  it("resolves the shortcuts from the caller's today, not the browser's clock", () => {
    const chosen: (LocalDate | null)[] = [];
    render(
      <DatePicker
        value={null}
        onValueChange={(next) => chosen.push(next)}
        today={localDate("2026-09-07")}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Due date" }));
    fireEvent.click(screen.getByRole("button", { name: "Tomorrow" }));

    expect(chosen).toEqual([localDate("2026-09-08")]);
  });
});
