import { describe, expect, it } from "vitest";

import {
  addDays,
  durationMinutes,
  ianaTimeZone,
  instant,
  localDate,
  minutesFromMidnight,
  startOfDay,
  UTC,
} from "../time";
import type { EventBlock, Occurrence, Recurrence } from "../types/calendar";
import type { IanaTimeZone, Instant, LocalDate, Uuid } from "../types/scalars";
import { expandAll, expandSeries, occurrenceId, type ExpansionWindow } from "./expand";

const d = localDate;
const i = instant;

/**
 *   America/New_York  2026-03-08 07:00Z  local 02:00 -> 03:00  (-5 -> -4)
 *                     2026-11-01 06:00Z  local 02:00 -> 01:00  (-4 -> -5)
 *   Pacific/Auckland  2026-09-26 14:00Z  local 02:00 -> 03:00  (+12 -> +13)  southern spring
 *                     2026-04-04 14:00Z  local 03:00 -> 02:00  (+13 -> +12)  southern autumn
 *   Europe/London     +01:00 all September
 */
const NEW_YORK = ianaTimeZone("America/New_York");
const AUCKLAND = ianaTimeZone("Pacific/Auckland");
const LONDON = ianaTimeZone("Europe/London");
const KOLKATA = ianaTimeZone("Asia/Kolkata");

const SERIES_ID: Uuid = "11111111-1111-4111-8111-111111111111";
const OTHER_SERIES_ID: Uuid = "22222222-2222-4222-8222-222222222222";
const USER_ID: Uuid = "99999999-9999-4999-8999-999999999999";

function rule(input: Partial<Recurrence> = {}): Recurrence {
  return {
    freq: "weekly",
    interval: 1,
    byWeekday: null,
    until: null,
    count: null,
    timezone: UTC,
    ...input,
  };
}

function series(input: {
  id?: Uuid;
  title?: string;
  startAt: string;
  endAt: string;
  recurrence: Recurrence | null;
}): EventBlock {
  const startAt = i(input.startAt);
  return {
    kind: "event",
    id: input.id ?? SERIES_ID,
    userId: USER_ID,
    title: input.title ?? "Systems lecture",
    description: null,
    startAt,
    endAt: i(input.endAt),
    allDay: false,
    color: null,
    completedAt: null,
    createdAt: startAt,
    updatedAt: startAt,
    taskId: null,
    habitId: null,
    recurrence: input.recurrence,
    seriesId: null,
    occurrenceDate: null,
    cancelled: false,
  };
}

function override(input: {
  seriesId?: Uuid;
  occurrenceDate: string;
  startAt: string;
  endAt: string;
  cancelled?: boolean;
  title?: string;
}): EventBlock {
  return {
    ...series({ startAt: input.startAt, endAt: input.endAt, recurrence: null }),
    id: `override-${input.occurrenceDate}`,
    title: input.title ?? "Systems lecture",
    seriesId: input.seriesId ?? SERIES_ID,
    occurrenceDate: d(input.occurrenceDate),
    cancelled: input.cancelled ?? false,
  };
}

/** `days` local days from local midnight on `from`, resolved in `tz`. */
function windowOf(from: string, days: number, tz: IanaTimeZone): ExpansionWindow {
  return { start: startOfDay(d(from), tz), end: startOfDay(addDays(d(from), days), tz) };
}

const datesOf = (occurrences: readonly Occurrence[]): LocalDate[] =>
  occurrences.map((occurrence) => occurrence.occurrenceDate);
const startsOf = (occurrences: readonly Occurrence[]): Instant[] =>
  occurrences.map((occurrence) => occurrence.startAt);

describe("occurrenceId", () => {
  it("keys an occurrence by its series and its date", () => {
    expect(occurrenceId(SERIES_ID, d("2026-09-07"))).toBe(`${SERIES_ID}:2026-09-07`);
  });
});

describe("daily series", () => {
  const standup = series({
    startAt: "2026-09-07T09:00:00.000Z",
    endAt: "2026-09-07T09:15:00.000Z",
    recurrence: rule({ freq: "daily" }),
  });

  it("fills a week, one occurrence a day", () => {
    const occurrences = expandSeries(standup, windowOf("2026-09-07", 7, UTC), []);
    expect(datesOf(occurrences)).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
    ]);
    expect(occurrences[0]).toMatchObject({
      id: `${SERIES_ID}:2026-09-07`,
      seriesId: SERIES_ID,
      startAt: "2026-09-07T09:00:00.000Z",
      endAt: "2026-09-07T09:15:00.000Z",
      series: standup,
      override: null,
    });
  });

  it("keeps its phase every three days", () => {
    const everyThird = series({
      startAt: "2026-09-07T09:00:00.000Z",
      endAt: "2026-09-07T09:15:00.000Z",
      recurrence: rule({ freq: "daily", interval: 3 }),
    });
    expect(datesOf(expandSeries(everyThird, windowOf("2026-09-07", 7, UTC), []))).toEqual([
      "2026-09-07",
      "2026-09-10",
      "2026-09-13",
    ]);
  });

  it("expands a window that opens months into the series", () => {
    const longRunning = series({
      startAt: "2026-01-05T09:00:00.000Z",
      endAt: "2026-01-05T09:15:00.000Z",
      recurrence: rule({ freq: "daily", interval: 2 }),
    });
    const occurrences = expandSeries(longRunning, windowOf("2026-09-07", 7, UTC), []);
    // 2026-01-05 → 2026-09-07 is 245 days, an odd number.
    expect(datesOf(occurrences)).toEqual(["2026-09-08", "2026-09-10", "2026-09-12"]);
    expect(occurrences.every((occurrence) => occurrence.series === longRunning)).toBe(true);
  });

  it("excludes an occurrence that ends exactly as the window opens", () => {
    const occurrences = expandSeries(standup, windowOf("2026-09-08", 1, UTC), []);
    expect(datesOf(occurrences)).toEqual(["2026-09-08"]);
  });
});

describe("weekly series", () => {
  const lecture = series({
    // 2026-09-07 is a Monday.
    startAt: "2026-09-07T14:00:00.000Z",
    endAt: "2026-09-07T15:30:00.000Z",
    recurrence: rule(),
  });

  it("repeats on the first occurrence's weekday when byWeekday is null", () => {
    expect(datesOf(expandSeries(lecture, windowOf("2026-09-07", 28, UTC), []))).toEqual([
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
      "2026-09-28",
    ]);
  });

  it("expands each listed weekday", () => {
    const mwf = series({
      startAt: "2026-09-07T14:00:00.000Z",
      endAt: "2026-09-07T15:30:00.000Z",
      recurrence: rule({ byWeekday: [1, 3, 5] }),
    });
    expect(datesOf(expandSeries(mwf, windowOf("2026-09-07", 7, UTC), []))).toEqual([
      "2026-09-07",
      "2026-09-09",
      "2026-09-11",
    ]);
  });

  it("skips the intervening week when the interval is two", () => {
    const fortnightly = series({
      startAt: "2026-09-07T14:00:00.000Z",
      endAt: "2026-09-07T15:30:00.000Z",
      recurrence: rule({ interval: 2 }),
    });
    expect(datesOf(expandSeries(fortnightly, windowOf("2026-09-07", 28, UTC), []))).toEqual([
      "2026-09-07",
      "2026-09-21",
    ]);
  });

  it("includes the until date itself and nothing after it", () => {
    const bounded = series({
      startAt: "2026-09-07T14:00:00.000Z",
      endAt: "2026-09-07T15:30:00.000Z",
      recurrence: rule({ until: d("2026-09-21") }),
    });
    expect(datesOf(expandSeries(bounded, windowOf("2026-09-07", 28, UTC), []))).toEqual([
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
    ]);
  });

  it("stops after count occurrences, wherever the window sits", () => {
    const threeWeeks = series({
      startAt: "2026-09-07T14:00:00.000Z",
      endAt: "2026-09-07T15:30:00.000Z",
      recurrence: rule({ count: 3 }),
    });
    expect(datesOf(expandSeries(threeWeeks, windowOf("2026-09-07", 35, UTC), []))).toEqual([
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
    ]);
    expect(datesOf(expandSeries(threeWeeks, windowOf("2026-09-21", 7, UTC), []))).toEqual([
      "2026-09-21",
    ]);
    expect(expandSeries(threeWeeks, windowOf("2026-09-28", 7, UTC), [])).toEqual([]);
  });
});

describe("overrides", () => {
  const lecture = series({
    startAt: "2026-09-07T14:00:00.000Z",
    endAt: "2026-09-07T15:30:00.000Z",
    recurrence: rule({ count: 3 }),
  });

  it("removes exactly one occurrence and does not extend a counted series", () => {
    const cancelled = override({
      occurrenceDate: "2026-09-14",
      startAt: "2026-09-14T14:00:00.000Z",
      endAt: "2026-09-14T15:30:00.000Z",
      cancelled: true,
    });
    // The cancelled occurrence has still consumed its slot; 09-28 must not replace it.
    expect(datesOf(expandSeries(lecture, windowOf("2026-09-07", 35, UTC), [cancelled]))).toEqual([
      "2026-09-07",
      "2026-09-21",
    ]);
  });

  it("uses the override's own times and reports the row that supplied them", () => {
    const moved = override({
      occurrenceDate: "2026-09-14",
      startAt: "2026-09-14T18:00:00.000Z",
      endAt: "2026-09-14T19:00:00.000Z",
      title: "Systems lecture (room change)",
    });
    const occurrences = expandSeries(lecture, windowOf("2026-09-14", 7, UTC), [moved]);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toMatchObject({
      // The id stays keyed to the date the rule produced.
      id: `${SERIES_ID}:2026-09-14`,
      occurrenceDate: "2026-09-14",
      startAt: "2026-09-14T18:00:00.000Z",
      endAt: "2026-09-14T19:00:00.000Z",
      override: moved,
      series: lecture,
    });
  });

  it("pulls an occurrence into the window when the override moved it there", () => {
    const daily = series({
      startAt: "2026-09-01T09:00:00.000Z",
      endAt: "2026-09-01T10:00:00.000Z",
      recurrence: rule({ freq: "daily" }),
    });
    const moved = override({
      occurrenceDate: "2026-09-06",
      startAt: "2026-09-08T12:00:00.000Z",
      endAt: "2026-09-08T13:00:00.000Z",
    });
    const occurrences = expandSeries(daily, windowOf("2026-09-07", 2, UTC), [moved]);
    expect(datesOf(occurrences)).toEqual(["2026-09-07", "2026-09-08", "2026-09-06"]);
    // Ordered by rendered time, not by occurrence date.
    expect(startsOf(occurrences)).toEqual([
      "2026-09-07T09:00:00.000Z",
      "2026-09-08T09:00:00.000Z",
      "2026-09-08T12:00:00.000Z",
    ]);
  });

  it("drops an occurrence the override moved out of the window", () => {
    const daily = series({
      startAt: "2026-09-01T09:00:00.000Z",
      endAt: "2026-09-01T10:00:00.000Z",
      recurrence: rule({ freq: "daily" }),
    });
    const moved = override({
      occurrenceDate: "2026-09-08",
      startAt: "2026-09-20T09:00:00.000Z",
      endAt: "2026-09-20T10:00:00.000Z",
    });
    expect(datesOf(expandSeries(daily, windowOf("2026-09-07", 3, UTC), [moved]))).toEqual([
      "2026-09-07",
      "2026-09-09",
    ]);
  });

  it("ignores overrides belonging to another series or to no occurrence", () => {
    const foreign = override({
      seriesId: OTHER_SERIES_ID,
      occurrenceDate: "2026-09-14",
      startAt: "2026-09-14T18:00:00.000Z",
      endAt: "2026-09-14T19:00:00.000Z",
      cancelled: true,
    });
    const occurrences = expandSeries(lecture, windowOf("2026-09-14", 7, UTC), [foreign]);
    expect(datesOf(occurrences)).toEqual(["2026-09-14"]);
    expect(occurrences[0]?.startAt).toBe("2026-09-14T14:00:00.000Z");
    expect(occurrences[0]?.override).toBeNull();
  });
});

describe("DST — northern hemisphere", () => {
  // A Monday 09:00–10:00 lecture in New York, spanning 2026-03-08.
  const lecture = series({
    startAt: "2026-02-16T14:00:00.000Z", // Mon 2026-02-16 09:00 EST
    endAt: "2026-02-16T15:00:00.000Z",
    recurrence: rule({ timezone: NEW_YORK }),
  });

  it("keeps 09:00 wall-clock across the spring-forward transition", () => {
    const occurrences = expandSeries(lecture, windowOf("2026-02-16", 35, NEW_YORK), []);
    expect(datesOf(occurrences)).toEqual([
      "2026-02-16",
      "2026-02-23",
      "2026-03-02",
      "2026-03-09",
      "2026-03-16",
    ]);
    for (const occurrence of occurrences) {
      expect(minutesFromMidnight(occurrence.startAt, NEW_YORK)).toBe(9 * 60);
      expect(minutesFromMidnight(occurrence.endAt, NEW_YORK)).toBe(10 * 60);
    }
    // The UTC instants are what move; the week containing the transition is 167 hours long.
    expect(startsOf(occurrences)).toEqual([
      "2026-02-16T14:00:00.000Z",
      "2026-02-23T14:00:00.000Z",
      "2026-03-02T14:00:00.000Z",
      "2026-03-09T13:00:00.000Z",
      "2026-03-16T13:00:00.000Z",
    ]);
    expect(durationMinutes(i("2026-03-02T14:00:00.000Z"), i("2026-03-09T13:00:00.000Z"))).toBe(
      167 * 60,
    );
  });

  it("keeps 09:00 wall-clock across the autumn transition", () => {
    const autumn = series({
      startAt: "2026-10-26T13:00:00.000Z", // Mon 2026-10-26 09:00 EDT
      endAt: "2026-10-26T14:00:00.000Z",
      recurrence: rule({ timezone: NEW_YORK }),
    });
    const occurrences = expandSeries(autumn, windowOf("2026-10-26", 21, NEW_YORK), []);
    expect(startsOf(occurrences)).toEqual([
      "2026-10-26T13:00:00.000Z",
      "2026-11-02T14:00:00.000Z",
      "2026-11-09T14:00:00.000Z",
    ]);
    for (const occurrence of occurrences) {
      expect(minutesFromMidnight(occurrence.startAt, NEW_YORK)).toBe(9 * 60);
    }
    expect(durationMinutes(i("2026-10-26T13:00:00.000Z"), i("2026-11-02T14:00:00.000Z"))).toBe(
      169 * 60,
    );
  });

  it("keeps the elapsed duration of an occurrence that spans the gap, moving its end", () => {
    // 01:00–03:00 daily: on 2026-03-08 two elapsed hours from 01:00 land on 04:00.
    const nightly = series({
      startAt: "2026-03-06T06:00:00.000Z", // 01:00 EST
      endAt: "2026-03-06T08:00:00.000Z", // 03:00 EST
      recurrence: rule({ freq: "daily", timezone: NEW_YORK }),
    });
    const occurrences = expandSeries(nightly, windowOf("2026-03-07", 2, NEW_YORK), []);
    expect(datesOf(occurrences)).toEqual(["2026-03-07", "2026-03-08"]);

    const ordinary = occurrences[0];
    const transition = occurrences[1];
    expect(minutesFromMidnight(ordinary!.startAt, NEW_YORK)).toBe(60);
    expect(minutesFromMidnight(ordinary!.endAt, NEW_YORK)).toBe(180);
    expect(minutesFromMidnight(transition!.startAt, NEW_YORK)).toBe(60);
    expect(minutesFromMidnight(transition!.endAt, NEW_YORK)).toBe(240);
    for (const occurrence of occurrences) {
      expect(durationMinutes(occurrence.startAt, occurrence.endAt)).toBe(120);
    }
  });
});

describe("DST — southern hemisphere", () => {
  it("keeps wall-clock time across Auckland's September spring-forward", () => {
    const gym = series({
      startAt: "2026-09-19T21:00:00.000Z", // Sun 2026-09-20 09:00 NZST
      endAt: "2026-09-19T22:00:00.000Z",
      recurrence: rule({ timezone: AUCKLAND }),
    });
    const occurrences = expandSeries(gym, windowOf("2026-09-20", 21, AUCKLAND), []);
    expect(datesOf(occurrences)).toEqual(["2026-09-20", "2026-09-27", "2026-10-04"]);
    expect(startsOf(occurrences)).toEqual([
      "2026-09-19T21:00:00.000Z",
      "2026-09-26T20:00:00.000Z",
      "2026-10-03T20:00:00.000Z",
    ]);
    for (const occurrence of occurrences) {
      expect(minutesFromMidnight(occurrence.startAt, AUCKLAND)).toBe(9 * 60);
    }
  });

  it("keeps wall-clock time across Auckland's April fall-back", () => {
    const gym = series({
      startAt: "2026-03-28T20:00:00.000Z", // Sun 2026-03-29 09:00 NZDT
      endAt: "2026-03-28T21:00:00.000Z",
      recurrence: rule({ timezone: AUCKLAND }),
    });
    const occurrences = expandSeries(gym, windowOf("2026-03-29", 14, AUCKLAND), []);
    expect(startsOf(occurrences)).toEqual(["2026-03-28T20:00:00.000Z", "2026-04-04T21:00:00.000Z"]);
    for (const occurrence of occurrences) {
      expect(minutesFromMidnight(occurrence.startAt, AUCKLAND)).toBe(9 * 60);
    }
  });
});

describe("a series whose timezone is not the window's", () => {
  it("keeps an occurrence that starts the day before the window and runs into it", () => {
    // London is +01:00 in September, so a UTC window opens at 01:00 local while the 09-06 occurrence is still running.
    const nightShift = series({
      startAt: "2026-09-01T22:30:00.000Z", // 23:30 BST
      endAt: "2026-09-02T00:30:00.000Z", // 01:30 BST the next day
      recurrence: rule({ freq: "daily", timezone: LONDON }),
    });
    const occurrences = expandSeries(nightShift, windowOf("2026-09-07", 1, UTC), []);
    expect(datesOf(occurrences)).toEqual(["2026-09-06", "2026-09-07"]);
    expect(startsOf(occurrences)).toEqual(["2026-09-06T22:30:00.000Z", "2026-09-07T22:30:00.000Z"]);
    expect(occurrences).toHaveLength(2);
  });

  it("keeps a multi-day occurrence that began several days before the window", () => {
    const conference = series({
      startAt: "2026-09-04T10:00:00.000Z",
      endAt: "2026-09-07T10:00:00.000Z",
      recurrence: rule({ interval: 4, timezone: KOLKATA }),
    });
    const occurrences = expandSeries(conference, windowOf("2026-09-06", 1, UTC), []);
    expect(datesOf(occurrences)).toEqual(["2026-09-04"]);
    expect(occurrences[0]?.endAt).toBe("2026-09-07T10:00:00.000Z");
  });
});

describe("expandAll", () => {
  const lecture = series({
    id: SERIES_ID,
    title: "Systems lecture",
    startAt: "2026-09-07T14:00:00.000Z", // Mon 10:00 EDT
    endAt: "2026-09-07T15:30:00.000Z",
    recurrence: rule({ timezone: NEW_YORK }),
  });
  const standup = series({
    id: OTHER_SERIES_ID,
    title: "Standup",
    startAt: "2026-09-07T13:00:00.000Z", // Mon 09:00 EDT
    endAt: "2026-09-07T13:15:00.000Z",
    recurrence: rule({ freq: "daily", byWeekday: null, timezone: NEW_YORK }),
  });

  it("merges the series into one list ordered by start time", () => {
    const occurrences = expandAll([lecture, standup], windowOf("2026-09-07", 2, NEW_YORK), []);
    expect(occurrences.map((occurrence) => occurrence.id)).toEqual([
      `${OTHER_SERIES_ID}:2026-09-07`,
      `${SERIES_ID}:2026-09-07`,
      `${OTHER_SERIES_ID}:2026-09-08`,
    ]);
  });

  it("routes each override to its own series", () => {
    // Both overrides name the same occurrence date; only the series id tells them apart.
    const overrides = [
      override({
        seriesId: OTHER_SERIES_ID,
        occurrenceDate: "2026-09-08",
        startAt: "2026-09-08T13:00:00.000Z",
        endAt: "2026-09-08T13:15:00.000Z",
        cancelled: true,
      }),
      override({
        seriesId: SERIES_ID,
        occurrenceDate: "2026-09-07",
        startAt: "2026-09-07T20:00:00.000Z",
        endAt: "2026-09-07T21:00:00.000Z",
      }),
    ];
    const occurrences = expandAll(
      [lecture, standup],
      windowOf("2026-09-07", 2, NEW_YORK),
      overrides,
    );
    expect(occurrences.map((occurrence) => occurrence.id)).toEqual([
      `${OTHER_SERIES_ID}:2026-09-07`,
      `${SERIES_ID}:2026-09-07`,
    ]);
    expect(occurrences[1]?.startAt).toBe("2026-09-07T20:00:00.000Z");
  });

  it("skips rows that are not series", () => {
    const plainEvent = series({
      id: "33333333-3333-4333-8333-333333333333",
      startAt: "2026-09-07T16:00:00.000Z",
      endAt: "2026-09-07T17:00:00.000Z",
      recurrence: null,
    });
    expect(expandAll([plainEvent], windowOf("2026-09-07", 7, NEW_YORK), [])).toEqual([]);
    expect(expandSeries(plainEvent, windowOf("2026-09-07", 7, NEW_YORK), [])).toEqual([]);
  });
});

describe("pathological input", () => {
  const daily = series({
    startAt: "2026-09-07T09:00:00.000Z",
    endAt: "2026-09-07T09:30:00.000Z",
    recurrence: rule({ freq: "daily", interval: 0, until: d("2999-12-31") }),
  });

  it("terminates on a non-advancing interval with an until centuries away", () => {
    expect(datesOf(expandSeries(daily, windowOf("2026-09-09", 2, UTC), []))).toEqual([
      "2026-09-09",
      "2026-09-10",
    ]);
  });

  it("terminates when a corrupt override date widens the range by centuries", () => {
    const corrupt = override({
      occurrenceDate: "2999-06-01",
      startAt: "2999-06-01T09:00:00.000Z",
      endAt: "2999-06-01T09:30:00.000Z",
    });
    expect(datesOf(expandSeries(daily, windowOf("2026-09-09", 2, UTC), [corrupt]))).toEqual([
      "2026-09-09",
      "2026-09-10",
    ]);
  });

  it("is deterministic: the same arguments give the same list", () => {
    const window = windowOf("2026-09-07", 7, UTC);
    expect(expandSeries(daily, window, [])).toEqual(expandSeries(daily, window, []));
  });
});
