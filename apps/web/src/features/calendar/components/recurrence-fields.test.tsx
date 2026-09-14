import { describe, expect, it } from "vitest";

import { localDate } from "@momentum/core/time";
import type { RecurrenceRule } from "@momentum/core/types";

import { fieldsFromRule, ruleFromFields } from "@/features/calendar/components/recurrence-fields";

// Monday 7 Sep 2026.
const MONDAY = localDate("2026-09-07");

describe("fieldsFromRule", () => {
  it("opens a plain event as not repeating, with its own weekday ready for Custom", () => {
    expect(fieldsFromRule(null, MONDAY)).toMatchObject({
      preset: "none",
      weekdays: [1],
      ends: "never",
    });
  });

  it("recognises the presets", () => {
    const base = { until: null, count: null };
    expect(
      fieldsFromRule({ freq: "daily", interval: 1, byWeekday: null, ...base }, MONDAY).preset,
    ).toBe("daily");
    expect(
      fieldsFromRule({ freq: "weekly", interval: 1, byWeekday: null, ...base }, MONDAY).preset,
    ).toBe("weekly");
    expect(
      fieldsFromRule({ freq: "weekly", interval: 1, byWeekday: [1], ...base }, MONDAY).preset,
    ).toBe("weekly");
    expect(
      fieldsFromRule({ freq: "weekly", interval: 2, byWeekday: [1], ...base }, MONDAY).preset,
    ).toBe("biweekly");
  });

  it("opens anything else as Custom with the rule's own numbers", () => {
    expect(
      fieldsFromRule(
        { freq: "weekly", interval: 3, byWeekday: [5, 1], until: null, count: null },
        MONDAY,
      ),
    ).toMatchObject({ preset: "custom", unit: "week", interval: 3, weekdays: [1, 5] });
    expect(
      fieldsFromRule(
        { freq: "daily", interval: 4, byWeekday: null, until: null, count: null },
        MONDAY,
      ),
    ).toMatchObject({ preset: "custom", unit: "day", interval: 4 });
  });

  it("carries how the rule ends", () => {
    expect(
      fieldsFromRule(
        {
          freq: "daily",
          interval: 1,
          byWeekday: null,
          until: localDate("2026-12-11"),
          count: null,
        },
        MONDAY,
      ),
    ).toMatchObject({ ends: "until", until: "2026-12-11" });
    expect(
      fieldsFromRule(
        { freq: "daily", interval: 1, byWeekday: null, until: null, count: 6 },
        MONDAY,
      ),
    ).toMatchObject({ ends: "count", count: 6 });
  });
});

describe("ruleFromFields", () => {
  const fields = fieldsFromRule(null, MONDAY);

  it("round-trips every rule the fields can express", () => {
    const rules: RecurrenceRule[] = [
      { freq: "weekly", interval: 1, byWeekday: null, until: null, count: null },
      { freq: "weekly", interval: 2, byWeekday: null, until: null, count: null },
      {
        freq: "weekly",
        interval: 3,
        byWeekday: [1, 3, 5],
        until: localDate("2026-12-11"),
        count: null,
      },
      { freq: "daily", interval: 1, byWeekday: null, until: null, count: 5 },
      { freq: "daily", interval: 4, byWeekday: null, until: null, count: null },
    ];
    for (const rule of rules) {
      expect(ruleFromFields(fieldsFromRule(rule, MONDAY), MONDAY)).toEqual({ rule, error: null });
    }
  });

  it("names the first thing wrong", () => {
    expect(
      ruleFromFields({ ...fields, preset: "custom", unit: "week", weekdays: [] }, MONDAY).error,
    ).toBe("Pick at least one day.");
    expect(ruleFromFields({ ...fields, preset: "custom", interval: 0 }, MONDAY).error).toBe(
      "Repeat every 1 to 52 weeks.",
    );
    expect(
      ruleFromFields({ ...fields, preset: "daily", ends: "until", until: "" }, MONDAY).error,
    ).toBe("Pick the date it ends on.");
    expect(
      ruleFromFields({ ...fields, preset: "daily", ends: "until", until: "2026-09-01" }, MONDAY)
        .error,
    ).toBe("The end date is before the first occurrence.");
    expect(
      ruleFromFields({ ...fields, preset: "daily", ends: "count", count: 0 }, MONDAY).error,
    ).toBe("Repeat 1 to 365 times.");
  });
});
