import type { Minutes } from "../types/scalars";
import type { Span } from "./grid";

/** Side-by-side layout for overlapping blocks, over minutes-from-midnight within one day column. */

export interface LaidOutSpan {
  id: string;
  start: Minutes;
  end: Minutes;
}

export interface OverlapPlacement {
  /** 0-based column within the cluster. */
  column: number;
  /** Columns in the cluster. Every member renders at `1 / columns` of the day width. */
  columns: number;
}

/** Touching spans (one ends at 10:00, the next starts at 10:00) do not overlap; a zero-length span overlaps nothing. */
export function spansOverlap(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Assigns each span a column and its cluster's column count. A cluster is a
 * maximal chain of spans connected by overlap; within it each span takes the
 * lowest free column. Deterministic regardless of input order, including the
 * map's iteration order, so blocks never jump columns between renders.
 */
export function layoutOverlaps(spans: readonly LaidOutSpan[]): Map<string, OverlapPlacement> {
  const ordered = spans.map(normalize).sort(byStartThenLongestThenId);
  const placements = new Map<string, OverlapPlacement>();

  for (const cluster of clusterByOverlap(ordered)) {
    // Spans arrive in start order, so each column's last end is its latest end.
    const columnEnds: Minutes[] = [];
    const members: { id: string; column: number }[] = [];

    for (const span of cluster) {
      let column = columnEnds.findIndex((end) => end <= span.start);
      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(span.end);
      } else {
        columnEnds[column] = span.end;
      }
      members.push({ id: span.id, column });
    }

    for (const member of members) {
      placements.set(member.id, { column: member.column, columns: columnEnds.length });
    }
  }

  return placements;
}

/** Splits start-ordered spans into overlap-connected clusters. */
function clusterByOverlap(ordered: readonly LaidOutSpan[]): LaidOutSpan[][] {
  const clusters: LaidOutSpan[][] = [];
  let current: LaidOutSpan[] = [];
  // The furthest end reached so far; input is sorted by start, so one pass is enough.
  let reach = Number.NEGATIVE_INFINITY;

  for (const span of ordered) {
    if (current.length > 0 && span.start >= reach) {
      clusters.push(current);
      current = [];
    }
    current.push(span);
    reach = Math.max(reach, span.end);
  }
  if (current.length > 0) clusters.push(current);

  return clusters;
}

// An inverted span (mid-drag preview) is read as the span between its edges; the sweep assumes `start <= end`.
function normalize(span: LaidOutSpan): LaidOutSpan {
  if (span.end >= span.start) return span;
  return { id: span.id, start: span.end, end: span.start };
}

function byStartThenLongestThenId(a: LaidOutSpan, b: LaidOutSpan): number {
  if (a.start !== b.start) return a.start - b.start;
  // Longest first, so a nested span takes the column to the right of its container.
  if (a.end !== b.end) return b.end - a.end;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}
