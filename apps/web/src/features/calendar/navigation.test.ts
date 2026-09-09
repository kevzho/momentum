import { describe, expect, it } from "vitest";

import { localDate } from "@momentum/core/time";

import {
  calendarHref,
  displayedDays,
  parseCalendarParams,
  rangeStart,
  shiftAnchor,
  NEW_EVENT_HREF,
  wantsNewEvent,
} from "@/features/calendar/navigation";

/**
 * The query string is user input: the anchor arrives from a link, from the back
 * button, or from someone typing into the address bar. What is pinned here is
 * the module's own promise — an anchor it cannot use lands the user on this
 * week rather than on the route's error boundary.
 */

const TODAY = localDate("2026-09-07");
const MONDAY = 1;

describe("parseCalendarParams", () => {
  it("takes an ordinary anchor and view straight from the query", () => {
    const params = parseCalendarParams({ week: "2026-09-14", view: "day" }, TODAY);

    expect(params).toEqual({ anchor: "2026-09-14", view: "day" });
  });

  it("falls back to today for an unparseable or impossible date", () => {
    for (const week of ["", "next tuesday", "2026-9-7", "2026-02-30"]) {
      expect(parseCalendarParams({ week }, TODAY).anchor).toBe(TODAY);
    }
  });

  it("falls back to today at the ends of the calendar rather than throwing", () => {
    // `isLocalDate` accepts any four-digit year, but `weekOf` steps a week
    // either side of the anchor and `localDate()` throws on the five-digit and
    // negative years that produces — inside a server component, where it
    // becomes the error boundary this fallback exists to avoid.
    for (const week of ["9999-12-31", "0000-01-01", "9999-01-01"]) {
      const params = parseCalendarParams({ week }, TODAY);
      expect(params.anchor).toBe(TODAY);
      expect(() => displayedDays(params, MONDAY)).not.toThrow();
    }
  });

  it("keeps the extremes it can actually navigate", () => {
    for (const week of ["0001-01-08", "9998-12-31"]) {
      const params = parseCalendarParams({ week }, TODAY);
      expect(params.anchor).toBe(week);
      // The whole pipeline the page runs on the parsed anchor.
      expect(displayedDays(params, MONDAY)).toHaveLength(7);
      expect(() => rangeStart(params, MONDAY)).not.toThrow();
      expect(() => shiftAnchor(params, MONDAY, -1)).not.toThrow();
      expect(() => calendarHref(params.anchor, params.view, TODAY)).not.toThrow();
    }
  });

  it("reads the first value when a parameter is repeated", () => {
    expect(parseCalendarParams({ week: ["2026-09-14", "2026-09-21"] }, TODAY).anchor).toBe(
      "2026-09-14",
    );
  });

  it("treats any view but day as the default week", () => {
    expect(parseCalendarParams({ view: "month" }, TODAY).view).toBe("week");
    expect(parseCalendarParams({}, TODAY).view).toBe("week");
  });
});

describe("the creation intent", () => {
  it("recognises the palette's own link, and nothing else", () => {
    expect(NEW_EVENT_HREF).toBe("/calendar?new=event");
    expect(wantsNewEvent({ new: "event" })).toBe(true);
    expect(wantsNewEvent({ new: ["event", "task"] })).toBe(true);
    expect(wantsNewEvent({ new: "task" })).toBe(false);
    expect(wantsNewEvent({ new: "" })).toBe(false);
    expect(wantsNewEvent({})).toBe(false);
  });
});
