import type { SnapMinutes } from "../types/profile";
import type { Minutes } from "../types/scalars";

/**
 * Grid geometry: pixels and wall-clock minutes-from-midnight only. No instants
 * or timezone here, which keeps DST out of the drag path entirely.
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
 * Pixel offset from the top of the day column to a wall-clock minute. Clamped
 * into the grid, rounded to whole minutes, deliberately not snapped.
 */
export function minutesFromY(y: number, spec: GridSpec): Minutes {
  const minutes = spec.dayStartMinutes + y / pixelsPerMinute(spec);
  return clamp(Math.round(minutes), spec.dayStartMinutes, gridEndMinutes(spec));
}

/** The inverse of `minutesFromY`, deliberately unclamped: a block before `dayStartMinutes` renders at a negative offset. */
export function yFromMinutes(minutes: Minutes, spec: GridSpec): number {
  return (minutes - spec.dayStartMinutes) * pixelsPerMinute(spec);
}

/** Rounds to the nearest snap increment, relative to midnight rather than `dayStartMinutes`. */
export function snap(minutes: Minutes, spec: GridSpec): Minutes {
  const slots = Math.round(minutes / spec.snapMinutes);
  // `Math.round` returns `-0` for inputs in [-0.5, 0); keep it from leaking into keys and snapshots.
  return slots === 0 ? 0 : slots * spec.snapMinutes;
}

/**
 * Places a span of the given duration inside the grid. A span past the bottom
 * slides up rather than being truncated (Domain Rule 3); a duration longer than
 * the grid fills it exactly.
 */
export function clampSpan(start: Minutes, durationMinutes: Minutes, spec: GridSpec): Span {
  const available = gridSpanMinutes(spec);
  // A negative duration (inverted span) reads as zero.
  const duration = Math.max(0, durationMinutes);
  if (duration >= available) {
    return { start: spec.dayStartMinutes, end: spec.dayStartMinutes + available };
  }
  const latestStart = spec.dayStartMinutes + available - duration;
  const clamped = clamp(start, spec.dayStartMinutes, latestStart);
  return { start: clamped, end: clamped + duration };
}

/**
 * Moves a span by a signed number of minutes, preserving its duration. The
 * keyboard move path; does not snap, or a sub-increment delta would become a no-op.
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

/** Where a dragged block lands. The new top is `pointerY - grabOffsetY`, so the block does not jump to the cursor. */
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

/** Where a resized block ends up. Only the dragged edge moves; dragging past the anchor pins the span at `minMinutes`. */
export function resolveResize({
  edge,
  pointerY,
  original,
  spec,
  minMinutes = MIN_BLOCK_MINUTES,
}: ResizeInput): Span {
  const gridStart = spec.dayStartMinutes;
  const gridEnd = gridEndMinutes(spec);
  // A floor taller than the grid cannot be honoured; filling the grid keeps every branch in range.
  const floor = clamp(minMinutes, 0, gridSpanMinutes(spec));
  const pointerMinutes = snap(minutesFromY(pointerY, spec), spec);

  if (edge === "end") {
    const start = clamp(original.start, gridStart, gridEnd - floor);
    return { start, end: clamp(pointerMinutes, start + floor, gridEnd) };
  }
  const end = clamp(original.end, gridStart + floor, gridEnd);
  return { start: clamp(pointerMinutes, gridStart, end - floor), end };
}

/** Minutes the grid renders; an inverted spec degenerates to an empty grid so every clamp stays total. */
function gridSpanMinutes(spec: GridSpec): Minutes {
  return Math.max(0, spec.dayEndMinutes - spec.dayStartMinutes);
}

function gridEndMinutes(spec: GridSpec): Minutes {
  return spec.dayStartMinutes + gridSpanMinutes(spec);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
