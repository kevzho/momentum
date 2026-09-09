import { describe, expect, it } from "vitest";

import { localTime } from "@momentum/core/time";

import { normaliseWindows, updateProfileSettingsInput } from "@/features/settings/schemas";

const HOURS = {
  0: [],
  1: [{ start: "09:00", end: "17:00" }],
  2: [
    { start: "09:00", end: "12:00" },
    { start: "13:00", end: "17:00" },
  ],
  3: [{ start: "09:00", end: "17:00" }],
  4: [{ start: "09:00", end: "17:00" }],
  5: [{ start: "09:00", end: "15:00" }],
  6: [],
};

/** A window as the mapper hands it to the page: branded. */
const stored = (window: { start: string; end: string }) => ({
  start: localTime(window.start),
  end: localTime(window.end),
});

function withDay(day: keyof typeof HOURS, windows: { start: string; end: string }[]) {
  return { ...HOURS, [day]: windows };
}

function issueAt(input: unknown): { path: string; message: string } | null {
  const parsed = updateProfileSettingsInput.safeParse(input);
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  if (issue === undefined) throw new Error("a failed parse has at least one issue");
  return { path: issue.path.map(String).join("."), message: issue.message };
}

describe("a valid patch", () => {
  it("accepts every field at once and returns them in domain shape", () => {
    const parsed = updateProfileSettingsInput.safeParse({
      displayName: "  Demo Ross  ",
      timezone: "Europe/London",
      weekStart: 0,
      snapMinutes: 30,
      workingHours: HOURS,
      focusWindows: [{ start: "09:00", end: "12:00" }],
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toEqual({
      displayName: "Demo Ross",
      timezone: "Europe/London",
      weekStart: 0,
      snapMinutes: 30,
      workingHours: HOURS,
      focusWindows: [{ start: "09:00", end: "12:00" }],
    });
  });

  it("accepts a single field, which is what every control sends", () => {
    expect(updateProfileSettingsInput.safeParse({ snapMinutes: 5 }).success).toBe(true);
    expect(updateProfileSettingsInput.safeParse({ focusWindows: [] }).success).toBe(true);
    expect(updateProfileSettingsInput.safeParse({ displayName: "" }).success).toBe(true);
  });
});

describe("what it refuses", () => {
  it("an empty patch", () => {
    expect(issueAt({})?.message).toBe("Nothing to save.");
    expect(issueAt({ displayName: undefined })?.message).toBe("Nothing to save.");
  });

  it("a window that ends before, or when, it starts", () => {
    expect(issueAt({ workingHours: withDay(1, [{ start: "17:00", end: "09:00" }]) })).toEqual({
      path: "workingHours.1.0.end",
      message: "A window has to end after it starts.",
    });
    expect(issueAt({ focusWindows: [{ start: "09:00", end: "09:00" }] })).toEqual({
      path: "focusWindows.0.end",
      message: "A window has to end after it starts.",
    });
  });

  it("a time that is not HH:MM", () => {
    expect(issueAt({ focusWindows: [{ start: "9:00", end: "12:00" }] })).toEqual({
      path: "focusWindows.0.start",
      message: "Times are HH:MM.",
    });
    expect(issueAt({ focusWindows: [{ start: "09:00", end: "25:00" }] })?.path).toBe(
      "focusWindows.0.end",
    );
  });

  it("a snapping increment the grid does not offer", () => {
    expect(issueAt({ snapMinutes: 20 })).toEqual({
      path: "snapMinutes",
      message: "Snapping is 5, 10, 15 or 30 minutes.",
    });
  });

  it("a week start that is not a day", () => {
    expect(issueAt({ weekStart: 7 })?.path).toBe("weekStart");
    expect(issueAt({ weekStart: "1" })?.path).toBe("weekStart");
  });

  it("a timezone the runtime does not recognise", () => {
    expect(issueAt({ timezone: "Mars/Olympus_Mons" })).toEqual({
      path: "timezone",
      message: "That is not a timezone Momentum recognises.",
    });
    // A POSIX offset is not an IANA name, whatever Postgres would make of it.
    expect(issueAt({ timezone: "" })?.path).toBe("timezone");
  });

  it("a display name past the column's bound", () => {
    expect(issueAt({ displayName: "x".repeat(81) })).toEqual({
      path: "displayName",
      message: "Display names are at most 80 characters.",
    });
  });

  it("working hours missing a day", () => {
    const sixDays = Object.fromEntries(Object.entries(HOURS).filter(([day]) => day !== "6"));
    expect(issueAt({ workingHours: sixDays })?.path).toBe("workingHours.6");
  });

  it("more than six windows in a day", () => {
    const seven = Array.from({ length: 7 }, (_, index) => ({
      start: `${String(index + 8).padStart(2, "0")}:00`,
      end: `${String(index + 8).padStart(2, "0")}:30`,
    }));
    expect(issueAt({ focusWindows: seven })).toEqual({
      path: "focusWindows",
      message: "At most six windows a day.",
    });
  });
});

describe("normalisation", () => {
  it("sorts windows by start", () => {
    const parsed = updateProfileSettingsInput.safeParse({
      focusWindows: [
        { start: "14:00", end: "17:00" },
        { start: "09:00", end: "12:00" },
      ],
    });
    expect(parsed.success && parsed.data.focusWindows).toEqual([
      { start: "09:00", end: "12:00" },
      { start: "14:00", end: "17:00" },
    ]);
  });

  it("merges windows that overlap into one that covers the same minutes", () => {
    const parsed = updateProfileSettingsInput.safeParse({
      workingHours: withDay(1, [
        { start: "09:00", end: "12:00" },
        { start: "11:00", end: "15:00" },
      ]),
    });
    expect(parsed.success && parsed.data.workingHours?.[1]).toEqual([
      { start: "09:00", end: "15:00" },
    ]);
  });

  it("merges windows that touch, and keeps windows with a gap apart", () => {
    expect(
      normaliseWindows(
        [
          { start: "09:00", end: "12:00" },
          { start: "12:00", end: "13:00" },
          { start: "14:00", end: "17:00" },
        ].map(stored),
      ),
    ).toEqual([
      { start: "09:00", end: "13:00" },
      { start: "14:00", end: "17:00" },
    ]);
  });

  it("absorbs a window that lies inside another", () => {
    expect(
      normaliseWindows(
        [
          { start: "10:00", end: "11:00" },
          { start: "09:00", end: "17:00" },
        ].map(stored),
      ),
    ).toEqual([{ start: "09:00", end: "17:00" }]);
  });

  it("leaves a canonical list exactly as it is", () => {
    const parsed = updateProfileSettingsInput.safeParse({ workingHours: HOURS });
    expect(parsed.success && parsed.data.workingHours).toEqual(HOURS);
  });
});
