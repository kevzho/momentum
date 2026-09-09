import { describe, expect, it } from "vitest";

import { durationMinutes, startOfDay } from "../time";
import { allPeriods, analyticsPeriod, periodContains, RANGE_DAYS } from "./period";
import { d, FALL_BACK, KOLKATA, NEW_YORK, SPRING_FORWARD } from "./test-fixtures";

describe("analyticsPeriod", () => {
  it("covers today and the days before it, inclusive", () => {
    const period = analyticsPeriod("7", d("2026-06-17"), NEW_YORK);

    expect(period.from).toBe("2026-06-11");
    expect(period.to).toBe("2026-06-17");
    expect(period.days).toHaveLength(7);
    expect(period.days.at(0)).toBe("2026-06-11");
    expect(period.days.at(-1)).toBe("2026-06-17");
  });

  it("gives each range the number of days it names", () => {
    for (const range of ["7", "30", "90"] as const) {
      const period = analyticsPeriod(range, d("2026-06-17"), NEW_YORK);
      expect(period.days).toHaveLength(RANGE_DAYS[range]);
    }
  });

  it("ends at tomorrow's local midnight, so today is whole", () => {
    const period = analyticsPeriod("7", d("2026-06-17"), NEW_YORK);

    expect(period.window.start).toBe(startOfDay(d("2026-06-11"), NEW_YORK));
    expect(period.window.end).toBe(startOfDay(d("2026-06-18"), NEW_YORK));
  });

  it("is 167 hours across a spring-forward day and 169 across a fall-back day", () => {
    const spring = analyticsPeriod("7", SPRING_FORWARD, NEW_YORK);
    const fall = analyticsPeriod("7", FALL_BACK, NEW_YORK);
    const ordinary = analyticsPeriod("7", d("2026-06-17"), NEW_YORK);

    expect(durationMinutes(spring.window.start, spring.window.end)).toBe(167 * 60);
    expect(durationMinutes(fall.window.start, fall.window.end)).toBe(169 * 60);
    expect(durationMinutes(ordinary.window.start, ordinary.window.end)).toBe(168 * 60);
  });

  it("resolves its window in the user's zone, not the server's", () => {
    const kolkata = analyticsPeriod("7", d("2026-06-17"), KOLKATA);

    // +05:30 means the local day begins at 18:30Z on the previous UTC date.
    expect(kolkata.window.start).toBe("2026-06-10T18:30:00.000Z");
    expect(kolkata.window.end).toBe("2026-06-17T18:30:00.000Z");
  });

  it("still spans exactly 30 dates when the period crosses a transition", () => {
    const period = analyticsPeriod("30", d("2026-03-20"), NEW_YORK);

    expect(period.days).toHaveLength(30);
    expect(period.days).toContain(SPRING_FORWARD);
    // 30 local days, one of which was 23 hours long.
    expect(durationMinutes(period.window.start, period.window.end)).toBe((30 * 24 - 1) * 60);
  });
});

describe("allPeriods", () => {
  it("makes each range the tail of the widest", () => {
    const periods = allPeriods(SPRING_FORWARD, NEW_YORK);

    expect(periods["7"].days).toEqual(periods["90"].days.slice(-7));
    expect(periods["30"].days).toEqual(periods["90"].days.slice(-30));
    expect(periods["7"].window.end).toBe(periods["90"].window.end);
  });
});

describe("periodContains", () => {
  const period = analyticsPeriod("7", d("2026-06-17"), NEW_YORK);

  it("includes both ends and excludes the days either side", () => {
    expect(periodContains(period, d("2026-06-11"))).toBe(true);
    expect(periodContains(period, d("2026-06-17"))).toBe(true);
    expect(periodContains(period, d("2026-06-10"))).toBe(false);
    expect(periodContains(period, d("2026-06-18"))).toBe(false);
  });
});
