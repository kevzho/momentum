import type { SnapMinutes } from "../types/profile";
import type { Minutes } from "../types/scalars";

/**
 * Grid geometry for the weekly calendar (docs/ARCHITECTURE.md §9).
 *
 * Everything in this module is pixels and wall-clock minutes-from-midnight.
 * There are no instants and no timezone here, on purpose: the caller resolves a
 * block into a (day, minutes) pair with `@momentum/core/time` before it reaches
 * the geometry, and converts back with `fromLocal` afterwards. That keeps DST
 * out of the drag path entirely — a 23- or 25-hour local day still renders the
 * same `dayStartMinutes`…`dayEndMinutes` column, and only the conversion at the
 * edges knows the difference — and it leaves every function below exhaustively
 * testable without a timezone database.
 */

export interface GridSpec {
  /** Wall-clock minutes from midnight where the grid starts. Default 300 (05:00). */
  dayStartMinutes: Minutes;
  /** Where it ends. Default 1440 (24:00). */
  dayEndMinutes: Minutes;
  /** Rendered height of one hour. Default 56. */
  hourHeightPx: number;
  /** Snapping increment, from the profile. Default 15. */
  snapMinutes: SnapMinutes;
}

/** A wall-clock span inside a single day column, in minutes from midnight. */
export interface Span {
  start: Minutes;
  end: Minutes;
}

export const DEFAULT_GRID_SPEC: GridSpec = {
  dayStartMinutes: 300,
  dayEndMinutes: 1440,
  hourHeightPx: 56,
  snapMinutes: 15,
};

/** The shortest block the UI will create or resize to. */
export const MIN_BLOCK_MINUTES: Minutes = 15;

export function pixelsPerMinute(spec: GridSpec): number {
  return spec.hourHeightPx / 60;
}

export function gridHeightPx(spec: GridSpec): number {
  return gridSpanMinutes(spec) * pixelsPerMinute(spec);
}

/**
 * Pixel offset from the top of the day column back to a wall-clock minute.
 *
 * The result is clamped into the grid, because a pointer can legitimately be
 * dragged above or below the column and the answer still has to be a time the
 * grid can show. It is deliberately *not* snapped: callers that need a slot call
 * `snap` explicitly, and callers that render a live "10:37" readout during a
 * drag need the unsnapped value.
 *
 * Rounding to whole minutes is part of the contract, not a convenience: `Minutes`
 * is an integer type, and letting a fractional pixel through would produce
 * instants at :07:30 that no other part of the system expects. It is also what
 * makes the round trip with `yFromMinutes` exact despite dividing by a
 * non-terminating pixels-per-minute ratio (56/60).
 */
export function minutesFromY(y: number, spec: GridSpec): Minutes {
  const minutes = spec.dayStartMinutes + y / pixelsPerMinute(spec);
  return clamp(Math.round(minutes), spec.dayStartMinutes, gridEndMinutes(spec));
}

/**
 * The inverse of `minutesFromY`, and deliberately unclamped: a block that starts
 * before `dayStartMinutes` must render at a negative offset and be clipped by the
 * column, rather than being pinned to the top of the grid where it would claim a
 * time it does not have.
 */
export function yFromMinutes(minutes: Minutes, spec: GridSpec): number {
  return (minutes - spec.dayStartMinutes) * pixelsPerMinute(spec);
}

/**
 * Rounds to the nearest snap increment.
 *
 * Nearest, not floor: a pointer past the halfway mark of a slot reads as the next
 * slot, and flooring would make every drag land systematically early. Relative to
 * midnight, not to `dayStartMinutes`: a 15-minute grid must land on :00/:15/:30/:45
 * whatever time the grid happens to start at, otherwise a grid starting at 05:20
 * would snap every block to :20/:35/:50/:05.
 */
export function snap(minutes: Minutes, spec: GridSpec): Minutes {
  // `Math.round` puts an exact tie on the later slot, which is how a pointer
  // resting on a slot boundary reads on a downward-growing time axis.
  const slots = Math.round(minutes / spec.snapMinutes);
  // `Math.round` returns `-0` for inputs in [-0.5, 0), and `-0 * n` keeps the
  // sign. `-0 !== 0` under `Object.is`, so it would leak a second spelling of
  // midnight into keys, snapshots and equality checks.
  return slots === 0 ? 0 : slots * spec.snapMinutes;
}

/**
 * Places a span of the given duration inside the grid.
 *
 * A span that would run past the bottom slides *up* until its end sits exactly on
 * `dayEndMinutes`; it is never truncated. Truncating would silently rewrite the
 * user's intent — a 90-minute block dropped near midnight is still a 90-minute
 * block — and Domain Rule 3 keeps planned duration under the user's control. A
 * duration longer than the whole grid is the one case where the duration cannot
 * survive, so it fills the grid exactly.
 */
export function clampSpan(start: Minutes, durationMinutes: Minutes, spec: GridSpec): Span {
  const available = gridSpanMinutes(spec);
  // A negative duration reaches us only from an inverted span; reading it as zero
  // keeps the result a valid (if empty) span instead of an inverted one.
  const duration = Math.max(0, durationMinutes);
  if (duration >= available) {
    return { start: spec.dayStartMinutes, end: spec.dayStartMinutes + available };
  }
  const latestStart = spec.dayStartMinutes + available - duration;
  const clamped = clamp(start, spec.dayStartMinutes, latestStart);
  return { start: clamped, end: clamped + duration };
}

/**
 * Moves a span by a signed number of minutes, preserving its duration.
 *
 * This is the keyboard move path (docs/ARCHITECTURE.md §9): ↑/↓ shift by one snap
 * increment, Shift+↑/↓ by an hour. It is a pure translation and does not snap —
 * the caller passes a delta that is already a whole increment, and snapping here
 * would turn a delta smaller than one increment into a silent no-op, which is
 * exactly how a keyboard control reads as broken.
 */
export function shiftSpan(span: Span, deltaMinutes: Minutes, spec: GridSpec): Span {
  return clampSpan(span.start + deltaMinutes, spanDurationMinutes(span), spec);
}

export function spanDurationMinutes(span: Span): Minutes {
  return span.end - span.start;
}

export interface DropInput {
  /** Pointer position relative to the top of the day column. */
  pointerY: number;
  /** How far below the block's own top edge the drag started. */
  grabOffsetY: number;
  durationMinutes: Minutes;
  spec: GridSpec;
}

/**
 * Where a dragged block lands.
 *
 * The block's new top is `pointerY - grabOffsetY`, not `pointerY`: the user grabbed
 * the block somewhere in its middle, and dropping its top edge under the cursor
 * would teleport the block upward by however far down they happened to grab it.
 * Duration is carried through untouched (see `clampSpan`).
 */
export function resolveDrop({ pointerY, grabOffsetY, durationMinutes, spec }: DropInput): Span {
  const top = minutesFromY(pointerY - grabOffsetY, spec);
  return clampSpan(snap(top, spec), durationMinutes, spec);
}

export interface ResizeInput {
  edge: "start" | "end";
  /** Pointer position relative to the top of the day column. */
  pointerY: number;
  original: Span;
  spec: GridSpec;
  /** Defaults to `MIN_BLOCK_MINUTES`. */
  minMinutes?: Minutes;
}

/**
 * Where a resized block ends up.
 *
 * Only the dragged edge moves; the opposite edge is the anchor, so a resize can
 * never turn into an accidental move. Dragging an edge past its anchor pins the
 * span at `minMinutes` rather than inverting it: an inverted span has no meaning
 * on the board, and collapsing to zero would let a block disappear mid-drag.
 */
export function resolveResize({
  edge,
  pointerY,
  original,
  spec,
  minMinutes = MIN_BLOCK_MINUTES,
}: ResizeInput): Span {
  const gridStart = spec.dayStartMinutes;
  const gridEnd = gridEndMinutes(spec);
  // A floor taller than the grid itself cannot be honoured; filling the grid is
  // the closest thing to it and keeps every branch below in range.
  const floor = clamp(minMinutes, 0, gridSpanMinutes(spec));
  const pointerMinutes = snap(minutesFromY(pointerY, spec), spec);

  if (edge === "end") {
    const start = clamp(original.start, gridStart, gridEnd - floor);
    return { start, end: clamp(pointerMinutes, start + floor, gridEnd) };
  }
  const end = clamp(original.end, gridStart + floor, gridEnd);
  return { start: clamp(pointerMinutes, gridStart, end - floor), end };
}

/**
 * Minutes the grid renders. Guarded against an inverted spec so that every clamp
 * below stays total: a `dayEndMinutes` before `dayStartMinutes` degenerates to an
 * empty grid instead of producing spans that run backwards.
 */
function gridSpanMinutes(spec: GridSpec): Minutes {
  return Math.max(0, spec.dayEndMinutes - spec.dayStartMinutes);
}

function gridEndMinutes(spec: GridSpec): Minutes {
  return spec.dayStartMinutes + gridSpanMinutes(spec);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
