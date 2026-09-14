import { describe, expect, it } from "vitest";

import { localDate } from "../time";
import { describeRecurrence, selectedWeekdays, weekOrder } from "./describe";

const MONDAY = localDate("2026-09-07");

describe("describeRecurrence", () => {
  it("names the presets plainly", () => {
    expect(
      describeRecurrence(
        { freq: "daily", interval: 1, byWeekday: null, until: null, count: null },
        MONDAY,
      ),
    ).toBe("Repeats every day");
    expect(
      describeRecurrence(
        { freq: "weekly", interval: 1, byWeekday: null, until: null, count: null },
        MONDAY,
      ),
    ).toBe("Repeats every week on Mon");
    expect(
      describeRecurrence(
        { freq: "weekly", interval: 2, byWeekday: null, until: null, count: null },
        MONDAY,
      ),
    ).toBe("Repeats every 2 weeks on Mon");
  });

  it("lists chosen weekdays Monday first and joins the last with 'and'", () => {
    expect(
      describeRecurrence(
        { freq: "weekly", interval: 1, byWeekday: [5, 0, 1], until: null, count: null },
        MONDAY,
      ),
    ).toBe("Repeats every week on Mon, Fri and Sun");
  });

  it("says how the rule ends", () => {
    expect(
      describeRecurrence(
        {
          freq: "weekly",
          interval: 1,
          byWeekday: [1, 3],
          until: localDate("2026-12-11"),
          count: null,
        },
        MONDAY,
      ),
    ).toBe("Repeats every week on Mon and Wed until Dec 11, 2026");
    expect(
      describeRecurrence(
        { freq: "daily", interval: 3, byWeekday: null, until: null, count: 4 },
        MONDAY,
      ),
    ).toBe("Repeats every 3 days, 4 times");
    expect(
      describeRecurrence(
        { freq: "daily", interval: 1, byWeekday: null, until: null, count: 1 },
        MONDAY,
      ),
    ).toBe("Repeats every day, 1 time");
  });
});

describe("weekOrder and selectedWeekdays", () => {
  it("orders Monday to Sunday and drops duplicates", () => {
    expect(weekOrder([0, 6, 1, 1, 3])).toEqual([1, 3, 6, 0]);
  });

  it("falls back to the first occurrence's weekday, and to nothing for a daily rule", () => {
    expect(selectedWeekdays({ freq: "weekly", byWeekday: null }, MONDAY)).toEqual([1]);
    expect(selectedWeekdays({ freq: "daily", byWeekday: null }, MONDAY)).toEqual([]);
  });
});
