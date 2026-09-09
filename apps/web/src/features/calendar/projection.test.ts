import { describe, expect, it } from "vitest";

import { DEFAULT_GRID_SPEC } from "@momentum/core/calendar";
import { addMinutes, fromLocal, ianaTimeZone, localDate } from "@momentum/core/time";
import type { IanaTimeZone, LocalDate, Minutes, ProjectColor } from "@momentum/core/types";

import {
  buildAllDay,
  buildDays,
  buildSegments,
  initialScrollMinutes,
  itemLabel,
  rangeEndExclusive,
  resolveGridSpec,
  spanOf,
} from "@/features/calendar/projection";
import type { CalendarItem } from "@/features/calendar/types";

const NEW_YORK = ianaTimeZone("America/New_York");
const AUCKLAND = ianaTimeZone("Pacific/Auckland");

function d(value: string): LocalDate {
  return localDate(value);
}

let sequence = 0;

function item(
  date: string,
  startMinutes: Minutes,
  durationMinutes: Minutes,
  overrides: Partial<CalendarItem> = {},
  timezone: IanaTimeZone = NEW_YORK,
): CalendarItem {
  const startAt = fromLocal(d(date), startMinutes, timezone);
  sequence += 1;
  return {
    id: `item-${sequence}`,
    blockId: `item-${sequence}`,
    kind: "event",
    title: "Untitled",
    description: null,
    startAt,
    endAt: addMinutes(startAt, durationMinutes),
    allDay: false,
    ownColor: null,
    color: "slate" as ProjectColor,
    completedAt: null,
    occurrence: null,
    work: null,
    habitId: null,
    habitRecordable: false,
    ...overrides,
  };
}

const WEEK = [
  d("2026-09-07"),
  d("2026-09-08"),
  d("2026-09-09"),
  d("2026-09-10"),
  d("2026-09-11"),
  d("2026-09-12"),
  d("2026-09-13"),
];

describe("buildSegments", () => {
  it("puts a block inside one day in that day's column, in wall-clock minutes", () => {
    const block = item("2026-09-08", 16 * 60, 45, { title: "Statistics" });
    const byDate = buildSegments([block], WEEK, NEW_YORK, DEFAULT_GRID_SPEC);

    expect(byDate.get("2026-09-08")).toEqual([
      expect.objectContaining({
        key: `${block.id}:2026-09-08`,
        date: "2026-09-08",
        startMinutes: 960,
        endMinutes: 1005,
        isStart: true,
        isEnd: true,
        column: 0,
        columns: 1,
      }),
    ]);
    expect(byDate.get("2026-09-07")).toEqual([]);
  });

  it("splits a block that crosses midnight across both columns", () => {
    // 23:30 Tuesday to 00:30 Wednesday.
    const block = item("2026-09-08", 23 * 60 + 30, 60, { title: "Night shift" });
    // The window has to grow to 00:00 for the Wednesday tail to exist at all.
    const spec = resolveGridSpec([block], WEEK, NEW_YORK);
    expect(spec.dayStartMinutes).toBe(0);
    const byDate = buildSegments([block], WEEK, NEW_YORK, spec);

    expect(byDate.get("2026-09-08")).toEqual([
      expect.objectContaining({
        startMinutes: 1410,
        endMinutes: 1440,
        isStart: true,
        isEnd: false,
      }),
    ]);
    expect(byDate.get("2026-09-09")).toEqual([
      expect.objectContaining({ startMinutes: 0, endMinutes: 30, isStart: false, isEnd: true }),
    ]);
  });

  it("keeps a midnight-crossing block sane on a spring-forward day", () => {
    // 2026-03-08 in America/New_York is 23 hours long; the column still shows 24 wall-clock hours.
    const march = [d("2026-03-08"), d("2026-03-09")];
    const block = item("2026-03-08", 23 * 60 + 30, 60);
    const byDate = buildSegments(
      [block],
      march,
      NEW_YORK,
      resolveGridSpec([block], march, NEW_YORK),
    );

    expect(byDate.get("2026-03-08")).toEqual([
      expect.objectContaining({ startMinutes: 1410, endMinutes: 1440 }),
    ]);
    expect(byDate.get("2026-03-09")).toEqual([
      expect.objectContaining({ startMinutes: 0, endMinutes: 30 }),
    ]);
  });

  it("keeps a midnight-crossing block sane on a fall-back day", () => {
    const november = [d("2026-11-01"), d("2026-11-02")];
    const block = item("2026-11-01", 23 * 60 + 30, 60);
    const byDate = buildSegments(
      [block],
      november,
      NEW_YORK,
      resolveGridSpec([block], november, NEW_YORK),
    );

    expect(byDate.get("2026-11-01")).toEqual([
      expect.objectContaining({ startMinutes: 1410, endMinutes: 1440 }),
    ]);
    expect(byDate.get("2026-11-02")).toEqual([
      expect.objectContaining({ startMinutes: 0, endMinutes: 30 }),
    ]);
  });

  it("resolves the day column in the profile timezone, not the host's", () => {
    // 21:00 on the 9th in Auckland (UTC+12) is 05:00 on the 9th in New York.
    const block = item("2026-09-09", 21 * 60, 30, {}, AUCKLAND);
    const inAuckland = buildSegments([block], WEEK, AUCKLAND, DEFAULT_GRID_SPEC);
    const inNewYork = buildSegments([block], WEEK, NEW_YORK, DEFAULT_GRID_SPEC);

    expect(inAuckland.get("2026-09-09")).toHaveLength(1);
    expect(inNewYork.get("2026-09-09")).toHaveLength(1);
    expect(inNewYork.get("2026-09-09")?.[0]?.startMinutes).toBe(5 * 60);
  });

  it("lays overlapping blocks out side by side, per day", () => {
    const a = item("2026-09-09", 9 * 60, 60);
    const b = item("2026-09-09", 9 * 60 + 30, 60);
    const elsewhere = item("2026-09-10", 9 * 60, 60);
    const byDate = buildSegments([a, b, elsewhere], WEEK, NEW_YORK, DEFAULT_GRID_SPEC);

    const wednesday = byDate.get("2026-09-09") ?? [];
    expect(wednesday.map((segment) => segment.columns)).toEqual([2, 2]);
    expect(new Set(wednesday.map((segment) => segment.column))).toEqual(new Set([0, 1]));

    // Same clock times on a different day are not an overlap.
    expect(byDate.get("2026-09-10")).toEqual([expect.objectContaining({ column: 0, columns: 1 })]);
  });

  it("separates blocks that are only close, not overlapping, once rendered", () => {
    // Both render at the 15-minute floor, so they would otherwise be drawn on top of each other.
    const a = item("2026-09-09", 9 * 60, 5);
    const b = item("2026-09-09", 9 * 60 + 10, 5);
    const wednesday = buildSegments([a, b], WEEK, NEW_YORK, DEFAULT_GRID_SPEC).get("2026-09-09");

    expect(wednesday?.map((segment) => segment.columns)).toEqual([2, 2]);
  });

  it("keeps all-day items out of the time grid and in their own bucket", () => {
    const allDay = item("2026-09-10", 0, 1440, { allDay: true, title: "Conference" });
    const spec = resolveGridSpec([allDay], WEEK, NEW_YORK);

    expect(buildSegments([allDay], WEEK, NEW_YORK, spec).get("2026-09-10")).toEqual([]);
    expect(buildAllDay([allDay], WEEK, NEW_YORK).get("2026-09-10")).toEqual([allDay]);
  });

  it("drops a segment the given spec cannot show, which is why the spec is derived from the items", () => {
    const block = item("2026-09-08", 23 * 60 + 30, 60);
    const tooNarrow = buildSegments([block], WEEK, NEW_YORK, DEFAULT_GRID_SPEC);

    expect(tooNarrow.get("2026-09-09")).toEqual([]);
    expect(
      buildSegments([block], WEEK, NEW_YORK, resolveGridSpec([block], WEEK, NEW_YORK)).get(
        "2026-09-09",
      ),
    ).toHaveLength(1);
  });

  it("ignores days outside the displayed range", () => {
    const block = item("2026-09-20", 10 * 60, 60);
    const byDate = buildSegments([block], WEEK, NEW_YORK, DEFAULT_GRID_SPEC);

    expect([...byDate.values()].flat()).toEqual([]);
  });
});

describe("resolveGridSpec", () => {
  it("keeps the default window when everything fits inside it", () => {
    const spec = resolveGridSpec([item("2026-09-08", 9 * 60, 60)], WEEK, NEW_YORK);

    expect(spec.dayStartMinutes).toBe(DEFAULT_GRID_SPEC.dayStartMinutes);
    expect(spec.dayEndMinutes).toBe(DEFAULT_GRID_SPEC.dayEndMinutes);
  });

  it("grows down to the hour containing the earliest block", () => {
    const spec = resolveGridSpec([item("2026-09-08", 4 * 60 + 30, 60)], WEEK, NEW_YORK);

    expect(spec.dayStartMinutes).toBe(4 * 60);
    expect(
      buildSegments([item("2026-09-08", 4 * 60 + 30, 60)], WEEK, NEW_YORK, spec).get("2026-09-08"),
    ).toHaveLength(1);
  });

  it("does not grow for a block on a day the range does not show", () => {
    const spec = resolveGridSpec([item("2026-09-20", 2 * 60, 60)], WEEK, NEW_YORK);

    expect(spec.dayStartMinutes).toBe(DEFAULT_GRID_SPEC.dayStartMinutes);
  });

  it("carries the profile's snap increment onto the spec", () => {
    expect(resolveGridSpec([], WEEK, NEW_YORK, DEFAULT_GRID_SPEC, 30).snapMinutes).toBe(30);
  });
});

describe("initialScrollMinutes", () => {
  it("opens on the working day when the week starts late", () => {
    const spec = resolveGridSpec([item("2026-09-08", 16 * 60, 60)], WEEK, NEW_YORK);

    expect(initialScrollMinutes([item("2026-09-08", 16 * 60, 60)], WEEK, NEW_YORK, spec)).toBe(
      8 * 60,
    );
  });

  it("opens an hour above the earliest block when that is earlier", () => {
    const early = [item("2026-09-08", 6 * 60, 60)];
    const spec = resolveGridSpec(early, WEEK, NEW_YORK);

    expect(initialScrollMinutes(early, WEEK, NEW_YORK, spec)).toBe(5 * 60);
  });

  it("never scrolls above the top of the grid", () => {
    const early = [item("2026-09-08", 0, 30)];
    const spec = resolveGridSpec(early, WEEK, NEW_YORK);

    expect(initialScrollMinutes(early, WEEK, NEW_YORK, spec)).toBe(spec.dayStartMinutes);
  });

  it("is not dragged to midnight by the tail of an overnight block", () => {
    const overnight = [item("2026-09-08", 23 * 60 + 30, 60)];
    const spec = resolveGridSpec(overnight, WEEK, NEW_YORK);

    expect(spec.dayStartMinutes).toBe(0);
    expect(initialScrollMinutes(overnight, WEEK, NEW_YORK, spec)).toBe(8 * 60);
  });
});

describe("buildDays", () => {
  it("labels each column and marks the server's today", () => {
    const days = buildDays(WEEK, d("2026-09-09"));

    expect(days.map((day) => day.weekdayLabel)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
    expect(days.map((day) => day.dayOfMonthLabel)).toEqual(["7", "8", "9", "10", "11", "12", "13"]);
    expect(days.filter((day) => day.isToday).map((day) => day.date)).toEqual(["2026-09-09"]);
  });

  it("marks no column when today is outside the range", () => {
    expect(buildDays(WEEK, d("2026-10-01")).some((day) => day.isToday)).toBe(false);
  });
});

describe("spanOf and labels", () => {
  it("returns the wall-clock span on the day the item starts", () => {
    expect(spanOf(item("2026-09-08", 16 * 60, 45), NEW_YORK)).toEqual({
      date: "2026-09-08",
      startMinutes: 960,
      endMinutes: 1005,
    });
  });

  it("counts a DST-spanning block in wall-clock minutes, not elapsed ones", () => {
    // 01:00 to 05:00 on 2026-03-08 in New York is four hours on the clock and three elapsed.
    const springForward = item("2026-03-08", 60, 180);
    expect(springForward.startAt).toBe("2026-03-08T06:00:00.000Z");
    expect(springForward.endAt).toBe("2026-03-08T09:00:00.000Z");
    expect(spanOf(springForward, NEW_YORK)).toEqual({
      date: "2026-03-08",
      startMinutes: 60,
      endMinutes: 300,
    });

    // The mirror: four wall-clock hours are five elapsed ones.
    const fallBack = item("2026-11-01", 60, 300);
    expect(spanOf(fallBack, NEW_YORK)).toEqual({
      date: "2026-11-01",
      startMinutes: 60,
      endMinutes: 300,
    });
  });

  it("expresses a midnight-crossing span as minutes past the start day's midnight", () => {
    // Deliberately not clamped to 1440.
    expect(spanOf(item("2026-09-08", 23 * 60 + 30, 60), NEW_YORK).endMinutes).toBe(1470);
  });

  it("names a block the way a screen reader needs to hear it", () => {
    expect(itemLabel(item("2026-09-08", 16 * 60, 45, { title: "Statistics" }), NEW_YORK)).toBe(
      "Statistics, Event, 16:00 – 16:45",
    );
    expect(
      itemLabel(
        item("2026-09-08", 16 * 60, 45, {
          title: "Problem set",
          kind: "work",
          completedAt: fromLocal(d("2026-09-08"), 1020, NEW_YORK),
        }),
        NEW_YORK,
      ),
    ).toBe("Problem set, Work block, 16:00 – 16:45, completed");
  });
});

describe("rangeEndExclusive", () => {
  it("is the day after the last displayed one", () => {
    expect(rangeEndExclusive(WEEK)).toBe("2026-09-14");
    expect(rangeEndExclusive([d("2026-12-31")])).toBe("2027-01-01");
  });

  it("refuses an empty range rather than inventing one", () => {
    expect(() => rangeEndExclusive([])).toThrow();
  });
});
