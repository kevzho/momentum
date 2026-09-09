import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_GRID_SPEC } from "@momentum/core/calendar";
import { ianaTimeZone, instant, localDate } from "@momentum/core/time";
import type { Instant, LocalDate } from "@momentum/core/types";

import { WeekGrid } from "@/features/calendar/components/week-grid";
import {
  buildAllDay,
  buildDays,
  buildSegments,
  resolveGridSpec,
} from "@/features/calendar/projection";
import type {
  CalendarCallbacks,
  CalendarItem,
  CalendarSettings,
  CandidateSpan,
} from "@/features/calendar/types";

// UTC keeps the arithmetic readable; timezone cases are the projection's own suite.
const TZ = ianaTimeZone("UTC");
const WEEK: LocalDate[] = [
  "2026-09-07",
  "2026-09-08",
  "2026-09-09",
  "2026-09-10",
  "2026-09-11",
  "2026-09-12",
  "2026-09-13",
].map(localDate);
const TODAY = localDate("2026-09-09");

const MONDAY = "Monday, September 7, 2026";
const TUESDAY = "Tuesday, September 8, 2026";
const WEDNESDAY = "Wednesday, September 9, 2026, today";
const THURSDAY = "Thursday, September 10, 2026";

function makeItem(overrides: Partial<CalendarItem> & Pick<CalendarItem, "id">): CalendarItem {
  return {
    blockId: overrides.id,
    kind: "event",
    title: "Untitled",
    description: null,
    startAt: instant("2026-09-08T09:00:00Z"),
    endAt: instant("2026-09-08T10:00:00Z"),
    allDay: false,
    ownColor: null,
    color: "blue",
    completedAt: null,
    occurrence: null,
    work: null,
    habitId: null,
    habitRecordable: false,
    ...overrides,
  };
}

function makeCallbacks(): CalendarCallbacks {
  return {
    onCreateAt: vi.fn(),
    onOpenItem: vi.fn(),
    onToggleComplete: vi.fn(),
    onDelete: vi.fn(),
    onReschedule: vi.fn(),
    onScheduleTask: vi.fn(),
  };
}

const EMPTY_PENDING: ReadonlySet<string> = new Set();

function renderGrid(
  items: readonly CalendarItem[],
  options: {
    now?: Instant | null;
    candidate?: CandidateSpan | null;
    pendingItemIds?: ReadonlySet<string>;
  } = {},
) {
  const spec = resolveGridSpec(items, WEEK, TZ);
  const settings: CalendarSettings = {
    timezone: TZ,
    weekStart: 1,
    snapMinutes: 15,
    spec,
  };
  const callbacks = makeCallbacks();
  const view = render(
    <WeekGrid
      days={buildDays(WEEK, TODAY)}
      settings={settings}
      segmentsByDate={buildSegments(items, WEEK, TZ, spec)}
      now={options.now ?? null}
      candidate={options.candidate ?? null}
      callbacks={callbacks}
      allDayByDate={buildAllDay(items, WEEK, TZ)}
      scrollToMinutes={spec.dayStartMinutes}
      pendingItemIds={options.pendingItemIds ?? EMPTY_PENDING}
    />,
  );
  return { ...view, spec, settings, callbacks };
}

function expectedTopPx(minutes: number, dayStartMinutes: number): number {
  return ((minutes - dayStartMinutes) / 60) * DEFAULT_GRID_SPEC.hourHeightPx;
}

describe("WeekGrid", () => {
  it("renders one column per displayed day and marks today", () => {
    renderGrid([]);
    for (const label of [MONDAY, TUESDAY, WEDNESDAY, THURSDAY]) {
      expect(screen.getByLabelText(label)).toBeDefined();
    }
  });

  it("rules the default window by the hour, not by the snap increment", () => {
    renderGrid([]);
    // 05:00 through 23:00 inclusive.
    expect(screen.getAllByText(/^\d{2}:00$/)).toHaveLength(19);
    expect(screen.getByText("05:00")).toBeDefined();
    expect(screen.queryByText("04:00")).toBeNull();
  });

  it("places a block in its own day column at the offset its start maps to", () => {
    const { spec } = renderGrid([
      makeItem({ id: "a", title: "Statistics homework" }),
      makeItem({
        id: "b",
        title: "Elsewhere",
        startAt: instant("2026-09-10T09:00:00Z"),
        endAt: instant("2026-09-10T10:00:00Z"),
      }),
    ]);

    const tuesday = screen.getByLabelText(TUESDAY);
    const block = within(tuesday).getByRole("group", { name: /Statistics homework/ });

    expect(block.style.top).toBe(`${expectedTopPx(9 * 60, spec.dayStartMinutes)}px`);
    expect(block.style.height).toBe(`${DEFAULT_GRID_SPEC.hourHeightPx}px`);
    expect(within(tuesday).queryByRole("button", { name: /Elsewhere/ })).toBeNull();
  });

  it("gives a block shorter than the floor a legible height", () => {
    const { spec } = renderGrid([
      makeItem({
        id: "short",
        title: "Standup",
        startAt: instant("2026-09-08T09:00:00Z"),
        endAt: instant("2026-09-08T09:05:00Z"),
      }),
    ]);

    const block = screen.getByRole("group", { name: /Standup/ });
    const fifteenMinutes = (15 / 60) * spec.hourHeightPx;
    expect(block.style.height).toBe(`${fifteenMinutes}px`);
  });

  it("lays overlapping blocks side by side at equal widths", () => {
    renderGrid([
      makeItem({ id: "a", title: "Lecture" }),
      makeItem({
        id: "b",
        title: "Study group",
        startAt: instant("2026-09-08T09:30:00Z"),
        endAt: instant("2026-09-08T10:30:00Z"),
      }),
    ]);

    const first = screen.getByRole("group", { name: /Lecture/ });
    const second = screen.getByRole("group", { name: /Study group/ });

    expect(first.style.width).toBe("50%");
    expect(second.style.width).toBe("50%");
    expect(first.style.left).toBe("0%");
    expect(second.style.left).toBe("50%");
  });

  it("keeps a block that crosses midnight in both of its day columns", () => {
    renderGrid([
      makeItem({
        id: "shift",
        title: "Night shift",
        startAt: instant("2026-09-07T23:30:00Z"),
        endAt: instant("2026-09-08T00:30:00Z"),
      }),
    ]);

    const monday = within(screen.getByLabelText(MONDAY));
    const tuesday = within(screen.getByLabelText(TUESDAY));

    expect(monday.getByRole("group", { name: /^Night shift/ })).toBeDefined();
    expect(
      tuesday.getByRole("group", { name: /Night shift.*continued from the previous day/ }),
    ).toBeDefined();
  });

  it("draws no now-line before the clock arrives", () => {
    const { container } = renderGrid([], { now: null });
    expect(container.querySelector('[data-slot="now-line"]')).toBeNull();
  });

  it("draws the now-line on the column the clock is in, and nowhere else", () => {
    const { container, spec } = renderGrid([], { now: instant("2026-09-09T14:30:00Z") });

    const lines = container.querySelectorAll('[data-slot="now-line"]');
    expect(lines).toHaveLength(1);

    const line = screen.getByLabelText(WEDNESDAY).querySelector('[data-slot="now-line"]');
    expect(line).not.toBeNull();
    expect((line as HTMLElement).style.top).toBe(
      `${expectedTopPx(14 * 60 + 30, spec.dayStartMinutes)}px`,
    );
  });

  it("previews the candidate span on the day it would commit to", () => {
    const candidate: CandidateSpan = {
      date: localDate("2026-09-10"),
      startMinutes: 13 * 60,
      endMinutes: 14 * 60,
      itemId: "a",
      label: "13:00 – 14:00",
    };
    const { spec } = renderGrid([], { candidate });

    const preview = screen
      .getByLabelText(THURSDAY)
      .querySelector<HTMLElement>('[data-slot="candidate"]');
    expect(preview).not.toBeNull();
    expect(preview?.textContent).toContain("13:00 – 14:00");
    expect(preview?.style.top).toBe(`${expectedTopPx(13 * 60, spec.dayStartMinutes)}px`);
    expect(preview?.getAttribute("aria-hidden")).toBe("true");
  });

  it("puts an all-day item in the strip and not in the time grid", () => {
    renderGrid([
      makeItem({
        id: "trip",
        title: "Conference",
        allDay: true,
        startAt: instant("2026-09-09T00:00:00Z"),
        endAt: instant("2026-09-10T00:00:00Z"),
      }),
    ]);

    expect(screen.getByRole("button", { name: /Conference/ })).toBeDefined();
    expect(
      within(screen.getByLabelText(WEDNESDAY)).queryByRole("button", { name: /Conference/ }),
    ).toBeNull();
  });

  it("renders an empty week as an ordinary week", () => {
    const { container } = renderGrid([]);
    expect(container.querySelectorAll('[data-slot="calendar-block"]')).toHaveLength(0);
    expect(screen.getAllByText(/^\d{2}:00$/).length).toBeGreaterThan(0);
  });
});

describe("the candidate outline's caption", () => {
  const block = makeItem({ id: "block-1", title: "Gym" });
  const own: CandidateSpan = {
    itemId: "block-1",
    date: localDate("2026-09-08"),
    startMinutes: 540,
    endMinutes: 600,
    label: "Tue Sep 8, 09:00 – 10:00",
  };

  it("is hidden while the candidate coincides with the block it belongs to", () => {
    const { container } = renderGrid([block], { candidate: own });

    const outline = container.querySelector('[data-slot="candidate"]');
    expect(outline).not.toBeNull();
    expect(outline?.textContent).toBe("");
  });

  it("appears once the candidate has moved off the block", () => {
    const moved: CandidateSpan = { ...own, startMinutes: 555, endMinutes: 615 };
    const { container } = renderGrid([block], { candidate: moved });

    expect(container.querySelector('[data-slot="candidate"]')?.textContent).toBe(own.label);
  });

  it("is shown for a task being dragged in, which has no block of its own", () => {
    const { container } = renderGrid([block], { candidate: { ...own, itemId: null } });

    expect(container.querySelector('[data-slot="candidate"]')?.textContent).toBe(own.label);
  });
});
