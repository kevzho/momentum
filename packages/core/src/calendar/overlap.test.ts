import { describe, expect, it } from "vitest";

import { layoutOverlaps, spansOverlap, type LaidOutSpan } from "./overlap";

/** `at("A", "09:00", "10:00")` — fixtures read as the board does. */
function at(id: string, start: string, end: string): LaidOutSpan {
  return { id, start: minutesOf(start), end: minutesOf(end) };
}

function minutesOf(hhmm: string): number {
  const [hours, minutes] = hhmm.split(":").map(Number) as [number, number];
  return hours * 60 + minutes;
}

/** Every ordering of the input, so "order does not matter" is proven, not assumed. */
function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, index) => {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    return permutations(rest).map((tail) => [item, ...tail]);
  });
}

describe("spansOverlap", () => {
  it("treats touching spans as adjacent, not concurrent", () => {
    expect(spansOverlap({ start: 540, end: 600 }, { start: 600, end: 660 })).toBe(false);
    expect(spansOverlap({ start: 540, end: 601 }, { start: 600, end: 660 })).toBe(true);
  });

  it("is symmetric, and reads a zero-length span as the point it sits on", () => {
    const a = { start: 540, end: 600 };
    const b = { start: 570, end: 630 };
    expect(spansOverlap(a, b)).toBe(spansOverlap(b, a));
    // A point strictly inside a span overlaps it; a point on either boundary does not.
    expect(spansOverlap({ start: 570, end: 570 }, a)).toBe(true);
    expect(spansOverlap({ start: 600, end: 600 }, a)).toBe(false);
    expect(spansOverlap({ start: 540, end: 540 }, a)).toBe(false);
  });
});

describe("layoutOverlaps", () => {
  it("returns nothing for an empty board", () => {
    expect(layoutOverlaps([])).toEqual(new Map());
  });

  it("gives a lone block the full width", () => {
    const layout = layoutOverlaps([at("A", "09:00", "10:00")]);
    expect(layout.get("A")).toEqual({ column: 0, columns: 1 });
  });

  it("keeps unrelated blocks full width", () => {
    const layout = layoutOverlaps([at("A", "09:00", "10:00"), at("B", "14:00", "15:00")]);
    expect(layout.get("A")).toEqual({ column: 0, columns: 1 });
    expect(layout.get("B")).toEqual({ column: 0, columns: 1 });
  });

  it("does not treat touching blocks as overlapping", () => {
    const layout = layoutOverlaps([
      at("A", "09:00", "10:00"),
      at("B", "10:00", "11:00"),
      at("C", "11:00", "12:00"),
    ]);
    for (const id of ["A", "B", "C"]) {
      expect(layout.get(id)).toEqual({ column: 0, columns: 1 });
    }
  });

  it("splits two overlapping blocks into two columns", () => {
    const layout = layoutOverlaps([at("A", "09:00", "10:00"), at("B", "09:30", "10:30")]);
    expect(layout.get("A")).toEqual({ column: 0, columns: 2 });
    expect(layout.get("B")).toEqual({ column: 1, columns: 2 });
  });

  it("keeps a chained cluster at one width and reuses a freed column", () => {
    // A 09:00-10:00, B 09:30-10:30, C 10:00-11:00. A overlaps B and B overlaps C,
    // but A and C do not: all three are one cluster, two columns wide, and C takes
    // A's column back.
    const layout = layoutOverlaps([
      at("A", "09:00", "10:00"),
      at("B", "09:30", "10:30"),
      at("C", "10:00", "11:00"),
    ]);
    expect(layout.get("A")).toEqual({ column: 0, columns: 2 });
    expect(layout.get("B")).toEqual({ column: 1, columns: 2 });
    expect(layout.get("C")).toEqual({ column: 0, columns: 2 });
  });

  it("puts a nested block beside its container, not on top of it", () => {
    const layout = layoutOverlaps([at("Outer", "09:00", "12:00"), at("Inner", "10:00", "10:30")]);
    expect(layout.get("Outer")).toEqual({ column: 0, columns: 2 });
    expect(layout.get("Inner")).toEqual({ column: 1, columns: 2 });
  });

  it("gives the container the leftmost column however the nesting is ordered", () => {
    const layout = layoutOverlaps([at("Inner", "09:00", "09:30"), at("Outer", "09:00", "12:00")]);
    expect(layout.get("Outer")).toEqual({ column: 0, columns: 2 });
    expect(layout.get("Inner")).toEqual({ column: 1, columns: 2 });
  });

  it("separates identical blocks", () => {
    const layout = layoutOverlaps([
      at("A", "09:00", "10:00"),
      at("B", "09:00", "10:00"),
      at("C", "09:00", "10:00"),
    ]);
    expect(layout.get("A")).toEqual({ column: 0, columns: 3 });
    expect(layout.get("B")).toEqual({ column: 1, columns: 3 });
    expect(layout.get("C")).toEqual({ column: 2, columns: 3 });
  });

  it("widens a cluster only as far as the blocks actually stacked at one moment", () => {
    // Five blocks all crossing 09:45, plus one that only touches the last of them.
    const layout = layoutOverlaps([
      at("A", "09:00", "10:00"),
      at("B", "09:10", "10:10"),
      at("C", "09:20", "10:20"),
      at("D", "09:30", "10:30"),
      at("E", "09:40", "10:40"),
      at("F", "10:40", "11:40"),
    ]);
    expect(layout.get("A")).toEqual({ column: 0, columns: 5 });
    expect(layout.get("E")).toEqual({ column: 4, columns: 5 });
    // F touches E's end, so it is a cluster of its own at full width.
    expect(layout.get("F")).toEqual({ column: 0, columns: 1 });
  });

  it("keeps a staircase two columns wide", () => {
    const layout = layoutOverlaps([
      at("A", "09:00", "10:00"),
      at("B", "09:30", "10:30"),
      at("C", "10:00", "11:00"),
      at("D", "10:30", "11:30"),
      at("E", "11:00", "12:00"),
    ]);
    expect(layout.get("A")).toEqual({ column: 0, columns: 2 });
    expect(layout.get("B")).toEqual({ column: 1, columns: 2 });
    expect(layout.get("C")).toEqual({ column: 0, columns: 2 });
    expect(layout.get("D")).toEqual({ column: 1, columns: 2 });
    expect(layout.get("E")).toEqual({ column: 0, columns: 2 });
  });

  it("never gives two overlapping blocks the same column", () => {
    const spans = [
      at("A", "08:00", "12:00"),
      at("B", "08:30", "09:00"),
      at("C", "08:45", "11:00"),
      at("D", "09:00", "09:30"),
      at("E", "10:30", "13:00"),
      at("F", "12:30", "12:45"),
      at("G", "14:00", "15:00"),
    ];
    const layout = layoutOverlaps(spans);

    for (const a of spans) {
      for (const b of spans) {
        if (a.id === b.id || !spansOverlap(a, b)) continue;
        expect(layout.get(a.id)?.column).not.toBe(layout.get(b.id)?.column);
      }
    }
    // Every block is placed, and a column index is always inside its cluster.
    expect(layout.size).toBe(spans.length);
    for (const span of spans) {
      const placement = layout.get(span.id);
      expect(placement).toBeDefined();
      expect(placement?.column).toBeLessThan(placement?.columns ?? 0);
    }
  });

  it("produces the same layout, in the same order, for any input order", () => {
    const spans = [
      at("A", "09:00", "10:00"),
      at("B", "09:30", "10:30"),
      at("C", "10:00", "11:00"),
      at("D", "14:00", "15:00"),
    ];
    const expected = [...layoutOverlaps(spans).entries()];

    for (const permutation of permutations(spans)) {
      expect([...layoutOverlaps(permutation).entries()]).toEqual(expected);
    }
  });

  it("lays out zero-length and inverted spans without crashing", () => {
    const layout = layoutOverlaps([
      at("A", "09:00", "10:00"),
      { id: "Empty", start: minutesOf("09:30"), end: minutesOf("09:30") },
      { id: "Inverted", start: minutesOf("11:00"), end: minutesOf("10:00") },
    ]);
    // The empty span is a point inside A, so it is placed beside it rather than
    // being dropped from the layout.
    expect(layout.get("A")).toEqual({ column: 0, columns: 2 });
    expect(layout.get("Empty")).toEqual({ column: 1, columns: 2 });
    // The inverted span reads as 10:00-11:00, which only touches A: its own cluster.
    expect(layout.get("Inverted")).toEqual({ column: 0, columns: 1 });
  });

  it("reads an inverted span as the span between its edges when it overlaps", () => {
    const layout = layoutOverlaps([
      at("A", "09:00", "10:00"),
      { id: "Inverted", start: minutesOf("09:45"), end: minutesOf("09:15") },
    ]);
    expect(layout.get("A")).toEqual({ column: 0, columns: 2 });
    expect(layout.get("Inverted")).toEqual({ column: 1, columns: 2 });
  });
});
