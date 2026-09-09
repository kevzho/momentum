import { describe, expect, it } from "vitest";

import { weekOf } from "./calendar-date";
import {
  formatCountdown,
  formatDuration,
  formatLocalDate,
  formatMinutesOfDay,
  formatTime,
  formatTimeRange,
  formatWeekRange,
} from "./format";
import { ianaTimeZone, instant, localDate, UTC } from "./scalars";

const NEW_YORK = ianaTimeZone("America/New_York");
const KOLKATA = ianaTimeZone("Asia/Kolkata");
const d = localDate;
const i = instant;

/** U+2013. Asserted by codepoint so a hyphen substituted by an editor fails loudly. */
const EN_DASH = "–";

describe("formatMinutesOfDay", () => {
  it("is 24-hour and zero-padded by default", () => {
    expect(formatMinutesOfDay(0)).toBe("00:00");
    expect(formatMinutesOfDay(300)).toBe("05:00");
    expect(formatMinutesOfDay(555)).toBe("09:15");
    expect(formatMinutesOfDay(1410)).toBe("23:30");
  });

  it("renders 12-hour labels without a leading zero", () => {
    expect(formatMinutesOfDay(0, { hour12: true })).toBe("12:00 AM");
    expect(formatMinutesOfDay(300, { hour12: true })).toBe("5:00 AM");
    expect(formatMinutesOfDay(720, { hour12: true })).toBe("12:00 PM");
    expect(formatMinutesOfDay(1380, { hour12: true })).toBe("11:00 PM");
  });

  it("uses a plain space before the meridiem, not ICU's narrow no-break space", () => {
    // Recent ICU versions emit U+202F here. It is invisible, it breaks string
    // comparison, and it leaks into anything that copies these labels.
    expect(formatMinutesOfDay(540, { hour12: true })).toBe("9:00 AM");
  });

  it("wraps the grid's 24:00 bottom edge round to midnight", () => {
    expect(formatMinutesOfDay(1440)).toBe("00:00");
    expect(formatMinutesOfDay(1440, { hour12: true })).toBe("12:00 AM");
    expect(formatMinutesOfDay(-30)).toBe("23:30");
  });
});

describe("formatTime", () => {
  it("reads the clock in the given timezone, not the host's", () => {
    expect(formatTime(i("2026-09-07T14:00:00Z"), UTC)).toBe("14:00");
    expect(formatTime(i("2026-09-07T14:00:00Z"), NEW_YORK)).toBe("10:00");
    expect(formatTime(i("2026-09-07T14:00:00Z"), KOLKATA)).toBe("19:30");
  });

  it("switches to 12-hour on request", () => {
    expect(formatTime(i("2026-09-07T14:00:00Z"), NEW_YORK, { hour12: true })).toBe("10:00 AM");
    expect(formatTime(i("2026-09-08T00:30:00Z"), NEW_YORK, { hour12: true })).toBe("8:30 PM");
  });
});

describe("formatTimeRange", () => {
  it("joins two times with a spaced en dash", () => {
    expect(formatTimeRange(i("2026-09-07T13:00:00Z"), i("2026-09-07T14:30:00Z"), UTC)).toBe(
      `13:00 ${EN_DASH} 14:30`,
    );
  });

  it("prints the meridiem once when both ends share it", () => {
    expect(
      formatTimeRange(i("2026-09-07T13:00:00Z"), i("2026-09-07T14:30:00Z"), UTC, { hour12: true }),
    ).toBe(`1:00 ${EN_DASH} 2:30 PM`);
  });

  it("prints both meridiems when the range crosses noon or midnight", () => {
    expect(
      formatTimeRange(i("2026-09-07T11:00:00Z"), i("2026-09-07T13:30:00Z"), UTC, { hour12: true }),
    ).toBe(`11:00 AM ${EN_DASH} 1:30 PM`);
  });

  it("labels a block that crosses midnight with both wall-clock times", () => {
    expect(formatTimeRange(i("2026-09-08T03:30:00Z"), i("2026-09-08T04:30:00Z"), NEW_YORK)).toBe(
      `23:30 ${EN_DASH} 00:30`,
    );
  });
});

describe("formatLocalDate", () => {
  it("renders each style", () => {
    expect(formatLocalDate(d("2026-09-07"), "weekday")).toBe("Mon");
    expect(formatLocalDate(d("2026-09-07"), "dayOfMonth")).toBe("7");
    expect(formatLocalDate(d("2026-09-07"), "monthDay")).toBe("Sep 7");
    expect(formatLocalDate(d("2026-09-07"), "medium")).toBe("Sep 7, 2026");
    expect(formatLocalDate(d("2026-09-07"), "long")).toBe("Monday, September 7, 2026");
  });

  it("never shifts the date, whatever the host timezone is", () => {
    // The suite runs under TZ=UTC and TZ=America/Los_Angeles. A formatter that
    // forgot `timeZone: "UTC"` would render "Sep 6" here under the second one.
    expect(formatLocalDate(d("2026-09-07"), "dayOfMonth")).toBe("7");
    expect(formatLocalDate(d("2026-01-01"), "medium")).toBe("Jan 1, 2026");
    expect(formatLocalDate(d("2025-12-31"), "medium")).toBe("Dec 31, 2025");
  });
});

describe("formatWeekRange", () => {
  it("omits the year for a week inside one month", () => {
    expect(formatWeekRange(weekOf(d("2026-09-09"), 1).days)).toBe(`Sep 7 ${EN_DASH} Sep 13`);
  });

  it("omits the year for a week that crosses a month", () => {
    expect(formatWeekRange(weekOf(d("2026-09-30"), 1).days)).toBe(`Sep 28 ${EN_DASH} Oct 4`);
  });

  it("adds the year to both ends when the week crosses one", () => {
    expect(formatWeekRange(weekOf(d("2025-12-31"), 1).days)).toBe(
      `Dec 29, 2025 ${EN_DASH} Jan 4, 2026`,
    );
  });

  it("degrades safely for an empty or single-day range", () => {
    expect(formatWeekRange([])).toBe("");
    expect(formatWeekRange([d("2026-09-07")])).toBe("Sep 7");
  });
});

describe("formatDuration", () => {
  it("uses the convention the product's copy was written in", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(90)).toBe("1h 30m");
    expect(formatDuration(135)).toBe("2h 15m");
    expect(formatDuration(1125)).toBe("18h 45m");
  });

  it("does not zero-pad the minutes", () => {
    expect(formatDuration(125)).toBe("2h 5m");
    expect(formatDuration(61)).toBe("1h 1m");
  });

  it("keeps the sign on a negative value rather than clamping it", () => {
    expect(formatDuration(-30)).toBe("-30m");
    expect(formatDuration(-90)).toBe("-1h 30m");
  });

  it("handles durations longer than a day without switching units", () => {
    expect(formatDuration(1500)).toBe("25h");
    expect(formatDuration(2895)).toBe("48h 15m");
  });
});

describe("formatCountdown", () => {
  it("is minutes and seconds, both padded", () => {
    expect(formatCountdown(1500)).toBe("25:00");
    expect(formatCountdown(299)).toBe("04:59");
    expect(formatCountdown(9)).toBe("00:09");
    expect(formatCountdown(0)).toBe("00:00");
  });

  it("grows an hour field only when there is one", () => {
    expect(formatCountdown(3599)).toBe("59:59");
    expect(formatCountdown(3600)).toBe("1:00:00");
    expect(formatCountdown(5400)).toBe("1:30:00");
  });

  it("truncates a fractional second rather than rounding up past the bell", () => {
    expect(formatCountdown(59.9)).toBe("00:59");
  });

  it("clamps a countdown that has run out", () => {
    expect(formatCountdown(-30)).toBe("00:00");
  });
});
