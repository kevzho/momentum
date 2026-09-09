import type { Minutes } from "../types/scalars";
import type { Span } from "./grid";

/**
 * Side-by-side layout for overlapping blocks (docs/ARCHITECTURE.md §9).
 *
 * Pure interval math over minutes-from-midnight, like the rest of this module:
 * the caller has already resolved each block into the day column it belongs to.
 */

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

/**
 * The single definition of the touching rule: a block ending at 10:00 and one
 * starting at 10:00 are adjacent, not concurrent, so they share a column. Strict
 * comparison on both sides also means a zero-length span overlaps nothing.
 */
export function spansOverlap(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Assigns each span a column and its cluster's column count.
 *
 * A cluster is a maximal *chain* of spans connected by overlap, not a set of
 * mutually overlapping spans: 09:00–10:00, 09:30–10:30 and 10:00–11:00 form one
 * cluster even though the first and last do not overlap each other. They have to
 * share a width, because the middle block needs a column of its own and anything
 * narrower for its neighbours would leave it drawn over one of them.
 *
 * Within a cluster each span takes the lowest column no span it overlaps is
 * already using, so the third span above reuses column 0 and the cluster is two
 * columns wide rather than three.
 *
 * The result is deterministic for a given set of spans regardless of input order,
 * including the iteration order of the returned map: layout feeds React keys and
 * inline styles, and a layout that reshuffles when an unrelated block is added
 * would show up as blocks jumping columns mid-session.
 */
export function layoutOverlaps(spans: readonly LaidOutSpan[]): Map<string, OverlapPlacement> {
  const ordered = spans.map(normalize).sort(byStartThenLongestThenId);
  const placements = new Map<string, OverlapPlacement>();

  for (const cluster of clusterByOverlap(ordered)) {
    // The end of the last span placed in each column. Because a column only ever
    // holds non-overlapping spans and they arrive in start order, that last span
    // also has the column's latest end — so this one comparison is equivalent to
    // testing the span against every span already in the column.
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
  // The furthest end reached so far. A span starting at or after it cannot touch
  // anything in the cluster, and neither can anything later, since the input is
  // sorted by start — that is what makes one pass enough.
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

/**
 * An inverted span is data, not a crash: it can arrive from a mid-drag preview or
 * a row written before a constraint existed. Reading it as the span between its
 * two edges places it somewhere sensible instead of corrupting the sweep, which
 * assumes `start <= end`.
 */
function normalize(span: LaidOutSpan): LaidOutSpan {
  if (span.end >= span.start) return span;
  return { id: span.id, start: span.end, end: span.start };
}

function byStartThenLongestThenId(a: LaidOutSpan, b: LaidOutSpan): number {
  if (a.start !== b.start) return a.start - b.start;
  // Longest first, so a span nested inside another is placed after its container
  // and takes the column to its right rather than pushing it across.
  if (a.end !== b.end) return b.end - a.end;
  // Ids are the last tiebreak, so equal spans always resolve the same way.
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}
