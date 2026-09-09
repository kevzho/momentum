import { describe, expect, it } from "vitest";

import type { GridSpec } from "@momentum/core/calendar";
import { localDate } from "@momentum/core/time";

import { formatSpan } from "@/features/calendar/announcements";
import type { BlockDragData, ResizeDragData, TaskDragData } from "@/features/calendar/dnd";
import {
  candidateFromEvent,
  moveSpanByDays,
  moveSpanByMinutes,
  originalSpanOf,
  pointerYWithin,
  resizeSpanByMinutes,
  resolveCandidateSpan,
  spanBetween,
  spanFromStart,
  spansEqual,
  type CandidateEvent,
} from "@/features/calendar/use-calendar-dnd";

/**
 * The candidate maths is where a drag becomes a time, and it is the one part of
 * the interaction layer that a regression can break without anything looking
 * wrong on screen. It is pure, so it is tested directly rather than through a
 * simulated drag.
 *
 * One hour is 60px here, so a pixel is a minute and the arithmetic in each
 * expectation is legible. The production default (56px) is exercised by the
 * geometry module's own suite; what this file asserts is which geometry
 * function each payload reaches and what it is handed.
 */
const SPEC: GridSpec = {
  dayStartMinutes: 300, // 05:00
  dayEndMinutes: 1440, // 24:00
  hourHeightPx: 60,
  snapMinutes: 15,
};

const TUE = localDate("2026-09-08");
const WED = localDate("2026-09-09");

/** Pixel offset inside the column for a wall-clock minute, at 60px per hour. */
const yOf = (minutes: number): number => minutes - SPEC.dayStartMinutes;

function blockDrag(overrides: Partial<BlockDragData> = {}): BlockDragData {
  return {
    type: "block",
    itemId: "block-1",
    title: "History essay",
    durationMinutes: 60,
    grabOffsetY: 0,
    date: TUE,
    startMinutes: 540,
    ...overrides,
  };
}

function resizeDrag(overrides: Partial<ResizeDragData> = {}): ResizeDragData {
  return {
    type: "resize",
    itemId: "block-1",
    title: "History essay",
    edge: "end",
    date: TUE,
    startMinutes: 540,
    endMinutes: 600,
    ...overrides,
  };
}

const taskDrag: TaskDragData = {
  type: "task",
  taskId: "task-1",
  title: "Problem set 4",
  durationMinutes: 45,
};

describe("resolveCandidateSpan", () => {
  it("drops a moved block under the pointer, minus where it was grabbed", () => {
    const span = resolveCandidateSpan({
      drag: blockDrag({ grabOffsetY: 20 }),
      date: TUE,
      pointerY: yOf(900) + 20,
      spec: SPEC,
    });

    expect(span).toEqual({ date: TUE, startMinutes: 900, endMinutes: 960 });
  });

  it("preserves the duration exactly when the move crosses to another day", () => {
    const span = resolveCandidateSpan({
      drag: blockDrag({ durationMinutes: 90 }),
      date: WED,
      pointerY: yOf(825),
      spec: SPEC,
    });

    expect(span.date).toBe(WED);
    expect(span.endMinutes - span.startMinutes).toBe(90);
  });

  it("snaps to the nearest increment rather than flooring", () => {
    const span = resolveCandidateSpan({
      drag: blockDrag(),
      date: TUE,
      // 09:08 is past the halfway mark of its slot, so it reads as 09:15.
      pointerY: yOf(548),
      spec: SPEC,
    });

    expect(span.startMinutes).toBe(555);
  });

  it("places a dragged task at the pointer, at the length the payload carries", () => {
    const span = resolveCandidateSpan({
      drag: taskDrag,
      date: WED,
      pointerY: yOf(960),
      spec: SPEC,
    });

    expect(span).toEqual({ date: WED, startMinutes: 960, endMinutes: 1005 });
  });

  it("moves only the dragged edge when resizing from the end", () => {
    const span = resolveCandidateSpan({
      drag: resizeDrag({ edge: "end" }),
      date: TUE,
      pointerY: yOf(660),
      spec: SPEC,
    });

    expect(span).toEqual({ date: TUE, startMinutes: 540, endMinutes: 660 });
  });

  it("moves only the dragged edge when resizing from the start", () => {
    const span = resolveCandidateSpan({
      drag: resizeDrag({ edge: "start" }),
      date: TUE,
      pointerY: yOf(480),
      spec: SPEC,
    });

    expect(span).toEqual({ date: TUE, startMinutes: 480, endMinutes: 600 });
  });

  it("holds the minimum duration instead of inverting when an edge crosses its anchor", () => {
    const collapsed = resolveCandidateSpan({
      drag: resizeDrag({ edge: "end" }),
      date: TUE,
      pointerY: yOf(400),
      spec: SPEC,
    });
    expect(collapsed).toEqual({ date: TUE, startMinutes: 540, endMinutes: 555 });

    const pushed = resolveCandidateSpan({
      drag: resizeDrag({ edge: "start" }),
      date: TUE,
      pointerY: yOf(900),
      spec: SPEC,
    });
    expect(pushed).toEqual({ date: TUE, startMinutes: 585, endMinutes: 600 });
  });

  it("keeps a resize on its own day however far sideways the pointer wanders", () => {
    const span = resolveCandidateSpan({
      drag: resizeDrag({ edge: "end" }),
      date: WED,
      pointerY: yOf(660),
      spec: SPEC,
    });

    expect(span.date).toBe(TUE);
  });

  it("pins a drag above the grid to the first slot without shortening it", () => {
    const span = resolveCandidateSpan({
      drag: blockDrag(),
      date: TUE,
      pointerY: -400,
      spec: SPEC,
    });

    expect(span).toEqual({ date: TUE, startMinutes: 300, endMinutes: 360 });
  });

  it("slides a drag past the bottom up instead of truncating it", () => {
    const span = resolveCandidateSpan({
      drag: blockDrag({ durationMinutes: 90 }),
      date: TUE,
      pointerY: 5000,
      spec: SPEC,
    });

    expect(span).toEqual({ date: TUE, startMinutes: 1350, endMinutes: 1440 });
  });
});

describe("pointerYWithin", () => {
  it("reads the live pointer against the column's current top", () => {
    const activator = new MouseEvent("pointerdown", { clientX: 10, clientY: 420 });
    expect(pointerYWithin(300, { x: 10, y: 510 }, activator, 90)).toBe(210);
  });

  it("falls back to the drag's translation from where the pointer started", () => {
    const activator = new MouseEvent("pointerdown", { clientX: 10, clientY: 420 });
    expect(pointerYWithin(300, null, activator, 90)).toBe(210);
  });

  it("reports no position when there is neither a pointer nor coordinates", () => {
    expect(pointerYWithin(300, null, null, 90)).toBeNull();
    expect(pointerYWithin(300, null, new Event("keydown"), 90)).toBeNull();
  });
});

/**
 * A task dragged out of a scrolled Plan panel. dnd-kit's `delta` is scroll-
 * adjusted across the scrollable ancestors of the node the pointer is *over*,
 * and the panel and the grid scroll separately, so once the pointer is on a
 * column `delta.y` carries the panel's scroll offset as if the pointer had
 * moved that far. The candidate has to come from where the pointer actually
 * is, not from that sum.
 */
describe("candidateFromEvent", () => {
  const DRAWER_SCROLL_TOP = 200;
  const column = { width: 100, height: 1140, top: 300, left: 0, right: 100, bottom: 1440 };

  function taskDragEvent(deltaY: number): CandidateEvent {
    return {
      active: {
        id: "task:task-1",
        data: { current: taskDrag },
        rect: { current: { initial: null, translated: null } },
      },
      over: {
        id: "day:2026-09-09",
        rect: column,
        data: { current: { type: "day", date: WED } },
        disabled: false,
      },
      activatorEvent: new MouseEvent("pointerdown", { clientX: 40, clientY: 420 }),
      delta: { x: 300, y: deltaY },
    };
  }

  it("lands a task from a scrolled panel under the pointer, not the scroll-shifted delta", () => {
    // The pointer went from 420 to 720 in the viewport: 90 minutes past 05:00
    // plus 300px, i.e. 12:00 on a 60px hour grid.
    const pointer = { x: 60, y: 720 };
    const event = taskDragEvent(300 - DRAWER_SCROLL_TOP);

    const candidate = candidateFromEvent(event, SPEC, pointer);

    expect(candidate).toMatchObject({ date: WED, startMinutes: 720, endMinutes: 765 });
  });

  it("uses the translation only when no pointer position is known", () => {
    const candidate = candidateFromEvent(taskDragEvent(300), SPEC, null);
    expect(candidate).toMatchObject({ date: WED, startMinutes: 720, endMinutes: 765 });
  });

  it("is null off every column", () => {
    const event: CandidateEvent = { ...taskDragEvent(0), over: null };
    expect(candidateFromEvent(event, SPEC, { x: 60, y: 720 })).toBeNull();
  });
});

describe("keyboard span arithmetic", () => {
  const span = { date: TUE, startMinutes: 540, endMinutes: 600 };

  it("moves by whole increments and keeps the duration", () => {
    expect(moveSpanByMinutes(span, 15, SPEC)).toEqual({
      date: TUE,
      startMinutes: 555,
      endMinutes: 615,
    });
    expect(moveSpanByMinutes(span, -60, SPEC)).toEqual({
      date: TUE,
      startMinutes: 480,
      endMinutes: 540,
    });
  });

  it("stops at the bottom of the grid rather than running off it", () => {
    const late = { date: TUE, startMinutes: 1380, endMinutes: 1440 };
    expect(moveSpanByMinutes(late, 15, SPEC)).toEqual(late);
  });

  it("changes the day without touching the wall-clock time", () => {
    expect(moveSpanByDays(span, 1)).toEqual({ date: WED, startMinutes: 540, endMinutes: 600 });
  });

  it("resizes one edge at a time and never past the floor", () => {
    expect(resizeSpanByMinutes(span, "end", 15, SPEC).endMinutes).toBe(615);
    expect(resizeSpanByMinutes(span, "end", -120, SPEC)).toEqual({
      date: TUE,
      startMinutes: 540,
      endMinutes: 555,
    });
    expect(resizeSpanByMinutes(span, "start", 15, SPEC).startMinutes).toBe(555);
    expect(resizeSpanByMinutes(span, "start", -600, SPEC).startMinutes).toBe(SPEC.dayStartMinutes);
  });
});

describe("create spans", () => {
  it("reads a selection dragged upward the same as one dragged down", () => {
    expect(spanBetween(TUE, 600, 540, SPEC)).toEqual(spanBetween(TUE, 540, 600, SPEC));
  });

  it("never produces a span shorter than one block", () => {
    expect(spanBetween(TUE, 600, 600, SPEC)).toEqual({
      date: TUE,
      startMinutes: 600,
      endMinutes: 615,
    });
  });

  it("keeps a default-length create inside the grid", () => {
    expect(spanFromStart(TUE, 1435, 30, SPEC)).toEqual({
      date: TUE,
      startMinutes: 1410,
      endMinutes: 1440,
    });
  });
});

describe("drag payload spans", () => {
  it("reads a block's original span from its duration and a resize's from both edges", () => {
    expect(originalSpanOf(blockDrag())).toEqual({
      date: TUE,
      startMinutes: 540,
      endMinutes: 600,
    });
    expect(originalSpanOf(resizeDrag({ endMinutes: 630 }))).toEqual({
      date: TUE,
      startMinutes: 540,
      endMinutes: 630,
    });
    expect(originalSpanOf(taskDrag)).toBeNull();
  });

  it("treats a span on another day as a different span", () => {
    const a = { date: TUE, startMinutes: 540, endMinutes: 600 };
    expect(spansEqual(a, { ...a })).toBe(true);
    expect(spansEqual(a, { ...a, date: WED })).toBe(false);
  });
});

describe("announcement wording", () => {
  it("speaks a span as a day and the page's own 24-hour range, never as pixels or an instant", () => {
    // The gutter, the block labels and Today's rows all read 07:15; a listener
    // hears the same clock rather than a translation of it.
    expect(formatSpan({ date: TUE, startMinutes: 540, endMinutes: 600 })).toBe(
      "Tue Sep 8, 09:00 – 10:00",
    );
    expect(formatSpan({ date: TUE, startMinutes: 435, endMinutes: 495 })).toBe(
      "Tue Sep 8, 07:15 – 08:15",
    );
  });
});
