import { describe, expect, it } from "vitest";

import { SNAP_MINUTES } from "../types/profile";
import {
  DEFAULT_GRID_SPEC,
  MIN_BLOCK_MINUTES,
  clampSpan,
  gridHeightPx,
  minutesFromY,
  pixelsPerMinute,
  resolveDrop,
  resolveResize,
  shiftSpan,
  snap,
  spanDurationMinutes,
  yFromMinutes,
  type GridSpec,
} from "./grid";

/** Shapes the grid is expected to survive: every snap increment, a late start, a short day. */
const SPECS: readonly GridSpec[] = [
  DEFAULT_GRID_SPEC,
  { dayStartMinutes: 0, dayEndMinutes: 1440, hourHeightPx: 40, snapMinutes: 5 },
  { dayStartMinutes: 330, dayEndMinutes: 1380, hourHeightPx: 72, snapMinutes: 10 },
  { dayStartMinutes: 420, dayEndMinutes: 1320, hourHeightPx: 56, snapMinutes: 30 },
  { dayStartMinutes: 300, dayEndMinutes: 1440, hourHeightPx: 100, snapMinutes: 15 },
];

function withSnap(snapMinutes: GridSpec["snapMinutes"]): GridSpec {
  return { ...DEFAULT_GRID_SPEC, snapMinutes };
}

describe("pixelsPerMinute / gridHeightPx", () => {
  it("derives the scale from the hour height", () => {
    expect(pixelsPerMinute(DEFAULT_GRID_SPEC)).toBe(56 / 60);
    expect(pixelsPerMinute({ ...DEFAULT_GRID_SPEC, hourHeightPx: 60 })).toBe(1);
  });

  it("measures the rendered column, 05:00 to midnight", () => {
    expect(gridHeightPx(DEFAULT_GRID_SPEC)).toBe(1140 * (56 / 60));
    expect(gridHeightPx({ ...DEFAULT_GRID_SPEC, hourHeightPx: 60 })).toBe(1140);
  });

  it("reports an empty column for an inverted spec rather than a negative height", () => {
    expect(gridHeightPx({ ...DEFAULT_GRID_SPEC, dayStartMinutes: 600, dayEndMinutes: 300 })).toBe(
      0,
    );
  });
});

describe("minutesFromY / yFromMinutes", () => {
  it("puts the top of the column at dayStartMinutes", () => {
    expect(yFromMinutes(300, DEFAULT_GRID_SPEC)).toBe(0);
    expect(minutesFromY(0, DEFAULT_GRID_SPEC)).toBe(300);
    expect(yFromMinutes(360, DEFAULT_GRID_SPEC)).toBe(56);
    expect(minutesFromY(56, DEFAULT_GRID_SPEC)).toBe(360);
  });

  for (const spec of SPECS) {
    it(`round-trips every minute of the grid (${spec.hourHeightPx}px/h from ${spec.dayStartMinutes})`, () => {
      for (let minutes = spec.dayStartMinutes; minutes <= spec.dayEndMinutes; minutes += 1) {
        expect(minutesFromY(yFromMinutes(minutes, spec), spec)).toBe(minutes);
      }
    });

    it(`reads a pointer position stably (${spec.hourHeightPx}px/h, ${spec.snapMinutes}m snap)`, () => {
      // Re-reading the same pointer during a drag must not drift: projecting a
      // fractional pixel to a minute and back has to be idempotent, or a block
      // would creep by a minute per animation frame.
      for (let y = -20; y <= gridHeightPx(spec) + 20; y += 0.5) {
        const minutes = minutesFromY(y, spec);
        expect(minutesFromY(yFromMinutes(minutes, spec), spec)).toBe(minutes);
        expect(Number.isInteger(minutes)).toBe(true);
        expect(snap(minutes, spec) % spec.snapMinutes).toBe(0);
      }
    });
  }

  it("clamps a pointer dragged outside the column into the grid", () => {
    expect(minutesFromY(-500, DEFAULT_GRID_SPEC)).toBe(300);
    expect(minutesFromY(gridHeightPx(DEFAULT_GRID_SPEC) + 500, DEFAULT_GRID_SPEC)).toBe(1440);
  });

  it("rounds a fractional pixel to a whole minute", () => {
    // 05:00 plus a third of a minute.
    expect(minutesFromY(pixelsPerMinute(DEFAULT_GRID_SPEC) / 3, DEFAULT_GRID_SPEC)).toBe(300);
    expect(minutesFromY(pixelsPerMinute(DEFAULT_GRID_SPEC) * 1.5, DEFAULT_GRID_SPEC)).toBe(302);
  });

  it("does not clamp the pixel direction, so an out-of-grid block stays measurable", () => {
    expect(yFromMinutes(240, DEFAULT_GRID_SPEC)).toBe(-56);
    expect(yFromMinutes(1500, DEFAULT_GRID_SPEC)).toBe(1200 * (56 / 60));
  });
});

describe("snap", () => {
  it("rounds to the nearest increment rather than flooring", () => {
    expect(snap(606, withSnap(15))).toBe(600);
    expect(snap(608, withSnap(15))).toBe(615);
    expect(snap(614, withSnap(15))).toBe(615);
  });

  it("puts an exact tie on the later slot", () => {
    expect(snap(607.5, withSnap(15))).toBe(615);
    expect(snap(602.5, withSnap(5))).toBe(605);
    expect(snap(605, withSnap(10))).toBe(610);
    expect(snap(615, withSnap(30))).toBe(630);
  });

  it("snaps relative to midnight, not to the top of the grid", () => {
    const offsetGrid: GridSpec = { ...DEFAULT_GRID_SPEC, dayStartMinutes: 320 };
    expect(snap(607, offsetGrid)).toBe(600);
    expect(snap(322, offsetGrid)).toBe(315);
  });

  it("honours every increment the profile offers", () => {
    for (const increment of SNAP_MINUTES) {
      const spec = withSnap(increment);
      expect(snap(0, spec)).toBe(0);
      expect(snap(1440, spec)).toBe(1440);
      expect(snap(increment * 3 + 1, spec)).toBe(increment * 3);
      expect(snap(increment * 3 - 1, spec)).toBe(increment * 3);
      expect(snap(increment * 3 + increment / 2, spec)).toBe(increment * 4);
      expect(snap(increment * 3 - increment / 2, spec)).toBe(increment * 3);
    }
  });

  it("handles negative and past-midnight inputs without special-casing them", () => {
    expect(snap(-7, DEFAULT_GRID_SPEC)).toBe(0);
    expect(snap(-8, DEFAULT_GRID_SPEC)).toBe(-15);
    expect(snap(-7.5, DEFAULT_GRID_SPEC)).toBe(0);
    expect(snap(-22, DEFAULT_GRID_SPEC)).toBe(-15);
    expect(snap(1447, DEFAULT_GRID_SPEC)).toBe(1440);
    expect(snap(1450, DEFAULT_GRID_SPEC)).toBe(1455);
  });

  it("never returns negative zero, which would be a second spelling of midnight", () => {
    expect(Object.is(snap(-1, DEFAULT_GRID_SPEC), 0)).toBe(true);
    expect(Object.is(snap(-7.5, DEFAULT_GRID_SPEC), 0)).toBe(true);
  });
});

describe("clampSpan", () => {
  it("leaves a span that already fits alone", () => {
    expect(clampSpan(600, 90, DEFAULT_GRID_SPEC)).toEqual({ start: 600, end: 690 });
  });

  it("slides up at the bottom edge instead of truncating the duration", () => {
    expect(clampSpan(1400, 90, DEFAULT_GRID_SPEC)).toEqual({ start: 1350, end: 1440 });
    expect(spanDurationMinutes(clampSpan(1400, 90, DEFAULT_GRID_SPEC))).toBe(90);
  });

  it("slides down at the top edge", () => {
    expect(clampSpan(120, 60, DEFAULT_GRID_SPEC)).toEqual({ start: 300, end: 360 });
  });

  it("fills the grid exactly when the duration is longer than the day shown", () => {
    expect(clampSpan(600, 1140, DEFAULT_GRID_SPEC)).toEqual({ start: 300, end: 1440 });
    expect(clampSpan(600, 5000, DEFAULT_GRID_SPEC)).toEqual({ start: 300, end: 1440 });
  });

  it("allows a zero-length span at either edge and never inverts one", () => {
    expect(clampSpan(1440, 0, DEFAULT_GRID_SPEC)).toEqual({ start: 1440, end: 1440 });
    expect(clampSpan(300, 0, DEFAULT_GRID_SPEC)).toEqual({ start: 300, end: 300 });
    expect(clampSpan(600, -30, DEFAULT_GRID_SPEC)).toEqual({ start: 600, end: 600 });
  });

  it("respects a grid that does not start at 05:00", () => {
    const spec: GridSpec = { ...DEFAULT_GRID_SPEC, dayStartMinutes: 420, dayEndMinutes: 1320 };
    expect(clampSpan(400, 60, spec)).toEqual({ start: 420, end: 480 });
    expect(clampSpan(1300, 60, spec)).toEqual({ start: 1260, end: 1320 });
  });
});

describe("shiftSpan", () => {
  it("translates a span and preserves its duration", () => {
    expect(shiftSpan({ start: 600, end: 660 }, 15, DEFAULT_GRID_SPEC)).toEqual({
      start: 615,
      end: 675,
    });
    expect(shiftSpan({ start: 600, end: 660 }, -60, DEFAULT_GRID_SPEC)).toEqual({
      start: 540,
      end: 600,
    });
  });

  it("stops at the edges without shortening the span", () => {
    expect(shiftSpan({ start: 1380, end: 1440 }, 60, DEFAULT_GRID_SPEC)).toEqual({
      start: 1380,
      end: 1440,
    });
    expect(shiftSpan({ start: 300, end: 345 }, -60, DEFAULT_GRID_SPEC)).toEqual({
      start: 300,
      end: 345,
    });
  });

  it("does not re-snap, so a sub-increment nudge still moves", () => {
    expect(shiftSpan({ start: 607, end: 667 }, 5, withSnap(15))).toEqual({ start: 612, end: 672 });
  });
});

describe("resolveDrop", () => {
  const spec = DEFAULT_GRID_SPEC;

  it("places the block's top edge under the pointer minus the grab offset", () => {
    const dropped = resolveDrop({
      pointerY: yFromMinutes(540, spec) + 28,
      grabOffsetY: 28,
      durationMinutes: 60,
      spec,
    });
    expect(dropped).toEqual({ start: 540, end: 600 });
  });

  it("snaps the top edge to the nearest increment", () => {
    expect(
      resolveDrop({ pointerY: yFromMinutes(547, spec), grabOffsetY: 0, durationMinutes: 50, spec }),
    ).toEqual({ start: 540, end: 590 });
    expect(
      resolveDrop({ pointerY: yFromMinutes(553, spec), grabOffsetY: 0, durationMinutes: 50, spec }),
    ).toEqual({ start: 555, end: 605 });
  });

  it("preserves the duration exactly when dropped past the bottom edge", () => {
    const dropped = resolveDrop({
      pointerY: gridHeightPx(spec) + 400,
      grabOffsetY: 10,
      durationMinutes: 90,
      spec,
    });
    expect(dropped).toEqual({ start: 1350, end: 1440 });
    expect(spanDurationMinutes(dropped)).toBe(90);
  });

  it("preserves the duration exactly when dropped above the top edge", () => {
    const dropped = resolveDrop({
      pointerY: -400,
      grabOffsetY: 0,
      durationMinutes: 45,
      spec,
    });
    expect(dropped).toEqual({ start: 300, end: 345 });
    expect(spanDurationMinutes(dropped)).toBe(45);
  });

  it("keeps the duration for every grab offset along a block", () => {
    for (let grabOffsetY = 0; grabOffsetY <= 56; grabOffsetY += 7) {
      const dropped = resolveDrop({
        pointerY: yFromMinutes(720, spec) + grabOffsetY,
        grabOffsetY,
        durationMinutes: 75,
        spec,
      });
      expect(spanDurationMinutes(dropped)).toBe(75);
      expect(dropped.start).toBe(720);
    }
  });

  it("works on a five-minute grid with a late start", () => {
    const fine: GridSpec = {
      dayStartMinutes: 420,
      dayEndMinutes: 1320,
      hourHeightPx: 72,
      snapMinutes: 5,
    };
    const dropped = resolveDrop({
      pointerY: yFromMinutes(608, fine),
      grabOffsetY: 0,
      durationMinutes: 25,
      spec: fine,
    });
    expect(dropped).toEqual({ start: 610, end: 635 });
  });
});

describe("resolveResize", () => {
  const spec = DEFAULT_GRID_SPEC;
  const original = { start: 600, end: 660 };

  it("moves the end edge and keeps the start", () => {
    expect(
      resolveResize({ edge: "end", pointerY: yFromMinutes(720, spec), original, spec }),
    ).toEqual({ start: 600, end: 720 });
    expect(
      resolveResize({ edge: "end", pointerY: yFromMinutes(630, spec), original, spec }),
    ).toEqual({ start: 600, end: 630 });
  });

  it("moves the start edge and keeps the end", () => {
    expect(
      resolveResize({ edge: "start", pointerY: yFromMinutes(540, spec), original, spec }),
    ).toEqual({ start: 540, end: 660 });
  });

  it("snaps the moving edge", () => {
    expect(
      resolveResize({ edge: "end", pointerY: yFromMinutes(727, spec), original, spec }),
    ).toEqual({ start: 600, end: 720 });
    expect(
      resolveResize({ edge: "start", pointerY: yFromMinutes(533, spec), original, spec }),
    ).toEqual({ start: 540, end: 660 });
  });

  it("pins the end at the minimum instead of crossing the start", () => {
    expect(
      resolveResize({ edge: "end", pointerY: yFromMinutes(400, spec), original, spec }),
    ).toEqual({ start: 600, end: 600 + MIN_BLOCK_MINUTES });
  });

  it("pins the start at the minimum instead of crossing the end", () => {
    expect(
      resolveResize({ edge: "start", pointerY: yFromMinutes(900, spec), original, spec }),
    ).toEqual({ start: 660 - MIN_BLOCK_MINUTES, end: 660 });
  });

  it("honours a caller-supplied minimum from both edges", () => {
    expect(
      resolveResize({
        edge: "end",
        pointerY: yFromMinutes(400, spec),
        original,
        spec,
        minMinutes: 30,
      }),
    ).toEqual({ start: 600, end: 630 });
    expect(
      resolveResize({
        edge: "start",
        pointerY: yFromMinutes(900, spec),
        original,
        spec,
        minMinutes: 30,
      }),
    ).toEqual({ start: 630, end: 660 });
  });

  it("stays inside the grid at both edges", () => {
    expect(
      resolveResize({
        edge: "end",
        pointerY: gridHeightPx(spec) + 800,
        original,
        spec,
      }),
    ).toEqual({ start: 600, end: 1440 });
    expect(resolveResize({ edge: "start", pointerY: -800, original, spec })).toEqual({
      start: 300,
      end: 660,
    });
  });

  it("pulls an anchor that sits outside the grid back into it", () => {
    // The anchor (02:00) is above the grid, so it comes back to 05:00; the pointer
    // snaps down to 08:15.
    const resized = resolveResize({
      edge: "end",
      pointerY: yFromMinutes(500, spec),
      original: { start: 120, end: 200 },
      spec,
    });
    expect(resized).toEqual({ start: 300, end: 495 });
  });

  it("fills the grid when the minimum is larger than the grid itself", () => {
    expect(
      resolveResize({
        edge: "end",
        pointerY: yFromMinutes(600, spec),
        original,
        spec,
        minMinutes: 5000,
      }),
    ).toEqual({ start: 300, end: 1440 });
  });
});
