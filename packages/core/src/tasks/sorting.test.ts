import { describe, expect, it } from "vitest";

import { instant, localDate } from "../time/scalars";
import type { Task, TaskPriority } from "../types/task";
import {
  TASK_SORTS,
  isTaskSort,
  moveInList,
  sortOrderBefore,
  sortOrdersForMove,
  sortTasks,
  type TaskOrder,
  type TaskSort,
} from "./sorting";

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    userId: "00000000-0000-4000-8000-000000000000",
    projectId: null,
    parentTaskId: null,
    title: id,
    description: null,
    status: "open",
    priority: 4 as TaskPriority,
    estimatedMinutes: null,
    actualMinutes: 0,
    dueDate: null,
    completedAt: null,
    archivedAt: null,
    sortOrder: 0,
    createdAt: instant("2026-09-01T00:00:00.000Z"),
    updatedAt: instant("2026-09-01T00:00:00.000Z"),
    ...overrides,
  };
}

const ids = (tasks: readonly Task[]): string[] => tasks.map((t) => t.id);

/** The list as it reads once a reorder's writes are applied. */
function applied(list: readonly Task[], changes: readonly TaskOrder[]): Task[] {
  const orders = new Map(changes.map((change) => [change.id, change.sortOrder]));
  return sortTasks(
    list.map((t) => {
      const sortOrder = orders.get(t.id);
      return sortOrder === undefined ? t : { ...t, sortOrder };
    }),
    "manual",
  );
}

describe("sortTasks", () => {
  it("offers exactly the sorts the toolbar shows", () => {
    expect([...TASK_SORTS]).toEqual(["manual", "due", "priority", "title", "created", "estimate"]);
    expect(isTaskSort("due")).toBe(true);
    expect(isTaskSort("colour")).toBe(false);
  });

  it("sorts by the user's own order", () => {
    const list = [
      task("c", { sortOrder: 3 }),
      task("a", { sortOrder: 1 }),
      task("b", { sortOrder: 2 }),
    ];
    expect(ids(sortTasks(list, "manual"))).toEqual(["a", "b", "c"]);
    expect(ids(sortTasks(list, "manual", "desc"))).toEqual(["c", "b", "a"]);
  });

  it("sorts by soonest deadline first", () => {
    const list = [
      task("late", { dueDate: localDate("2026-09-20") }),
      task("soon", { dueDate: localDate("2026-09-07") }),
      task("mid", { dueDate: localDate("2026-09-12") }),
    ];
    expect(ids(sortTasks(list, "due"))).toEqual(["soon", "mid", "late"]);
  });

  it("sorts by most urgent priority first, with P4 meaning none", () => {
    const list = [
      task("p4", { priority: 4 }),
      task("p1", { priority: 1 }),
      task("p3", { priority: 3 }),
    ];
    expect(ids(sortTasks(list, "priority"))).toEqual(["p1", "p3", "p4"]);
  });

  it("sorts titles case-insensitively", () => {
    const list = [
      task("z", { title: "apple" }),
      task("y", { title: "Banana" }),
      task("x", { title: "Cherry" }),
    ];
    expect(ids(sortTasks(list, "title"))).toEqual(["z", "y", "x"]);
  });

  it("sorts by creation and by estimate", () => {
    const list = [
      task("second", { createdAt: instant("2026-09-02T00:00:00.000Z"), estimatedMinutes: 30 }),
      task("first", { createdAt: instant("2026-09-01T00:00:00.000Z"), estimatedMinutes: 120 }),
    ];
    expect(ids(sortTasks(list, "created"))).toEqual(["first", "second"]);
    expect(ids(sortTasks(list, "estimate"))).toEqual(["second", "first"]);
  });

  it("keeps missing values last in BOTH directions", () => {
    const list = [
      task("none"),
      task("late", { dueDate: localDate("2026-09-20") }),
      task("soon", { dueDate: localDate("2026-09-07") }),
    ];
    expect(ids(sortTasks(list, "due"))).toEqual(["soon", "late", "none"]);
    expect(ids(sortTasks(list, "due", "desc"))).toEqual(["late", "soon", "none"]);

    const estimates = [
      task("none"),
      task("long", { estimatedMinutes: 120 }),
      task("short", { estimatedMinutes: 15 }),
    ];
    expect(ids(sortTasks(estimates, "estimate"))).toEqual(["short", "long", "none"]);
    expect(ids(sortTasks(estimates, "estimate", "desc"))).toEqual(["long", "short", "none"]);
  });

  it("is stable: equal rows keep the user's manual order, then a fixed id order", () => {
    const list = [
      task("c", { priority: 2, sortOrder: 3 }),
      task("a", { priority: 2, sortOrder: 1 }),
      task("b", { priority: 2, sortOrder: 2 }),
    ];
    expect(ids(sortTasks(list, "priority"))).toEqual(["a", "b", "c"]);

    const tied = [task("c"), task("a"), task("b")];
    expect(ids(sortTasks(tied, "priority"))).toEqual(["a", "b", "c"]);
    expect(ids(sortTasks(sortTasks(tied, "priority"), "priority"))).toEqual(["a", "b", "c"]);
  });

  it("never mutates its input", () => {
    const list = [task("b", { sortOrder: 2 }), task("a", { sortOrder: 1 })];
    const before = ids(list);
    sortTasks(list, "manual");
    expect(ids(list)).toEqual(before);
  });

  it("is total: every sort handles an empty and a single-item list", () => {
    for (const sort of TASK_SORTS as readonly TaskSort[]) {
      expect(sortTasks([], sort)).toEqual([]);
      expect(ids(sortTasks([task("only")], sort))).toEqual(["only"]);
    }
  });
});

describe("sortOrdersForMove", () => {
  const spread = [
    task("a", { sortOrder: 10 }),
    task("b", { sortOrder: 20 }),
    task("c", { sortOrder: 30 }),
    task("d", { sortOrder: 40 }),
  ];

  it("writes one row when the two new neighbours leave a midpoint", () => {
    expect(sortOrdersForMove(spread, "a", 1)).toEqual([{ id: "a", sortOrder: 25 }]);
    expect(sortOrdersForMove(spread, "d", 0)).toEqual([{ id: "d", sortOrder: 9 }]);
    expect(sortOrdersForMove(spread, "a", 3)).toEqual([{ id: "a", sortOrder: 41 }]);
  });

  it("writes nothing for a move that changes nothing", () => {
    expect(sortOrdersForMove(spread, "a", 0)).toEqual([]);
    expect(sortOrdersForMove(spread, "unknown", 2)).toEqual([]);
    expect(sortOrdersForMove([task("only")], "only", 0)).toEqual([]);
  });

  it("lands the row on the drop index in a run of equal orders, in both directions", () => {
    const flat = [task("a"), task("b"), task("c"), task("d"), task("e")];

    expect(ids(applied(flat, sortOrdersForMove(flat, "e", 1)))).toEqual(["a", "e", "b", "c", "d"]);
    expect(ids(applied(flat, sortOrdersForMove(flat, "a", 3)))).toEqual(["b", "c", "d", "a", "e"]);
    expect(ids(applied(flat, sortOrdersForMove(flat, "c", 0)))).toEqual(["c", "a", "b", "d", "e"]);
    expect(ids(applied(flat, sortOrdersForMove(flat, "a", 4)))).toEqual(["b", "c", "d", "e", "a"]);
  });

  it("lands the row on the drop index for a tie of any length", () => {
    for (let length = 2; length <= 8; length += 1) {
      const flat = Array.from({ length }, (_, index) => task(`t${index}`));
      for (let from = 0; from < length; from += 1) {
        for (let to = 0; to < length; to += 1) {
          const moved = flat[from] as Task;
          const expected = moveInList(flat, moved.id, to);
          expect(ids(applied(flat, sortOrdersForMove(flat, moved.id, to)))).toEqual(ids(expected));
        }
      }
    }
  });

  it("spreads only the tied run, leaving it between the rows around it", () => {
    // Only the three tied rows may be renumbered, and only inside the gap.
    const list = [
      task("first", { sortOrder: -10 }),
      task("a"),
      task("b"),
      task("c"),
      task("last", { sortOrder: 10 }),
    ];
    const changes = sortOrdersForMove(list, "c", 2);

    expect(ids(applied(list, changes))).toEqual(["first", "a", "c", "b", "last"]);
    expect(changes.map((change) => change.id).sort()).toEqual(["a", "b"]);
    for (const change of changes) {
      expect(change.sortOrder).toBeGreaterThan(-10);
      expect(change.sortOrder).toBeLessThan(10);
    }
  });

  it("leaves an already-spread list bisecting with a single write", () => {
    let current = [...spread];
    for (let pass = 0; pass < 10; pass += 1) {
      const last = current[current.length - 1] as Task;
      const changes = sortOrdersForMove(current, last.id, 1);
      expect(changes).toHaveLength(1);
      current = applied(current, changes);
      expect(ids(current)[1]).toBe(last.id);
    }
  });
});

describe("moveInList", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("moves an item to an index", () => {
    expect(moveInList(items, "a", 2).map((i) => i.id)).toEqual(["b", "c", "a"]);
    expect(moveInList(items, "c", 0).map((i) => i.id)).toEqual(["c", "a", "b"]);
  });

  it("copies rather than mutating, and tolerates an unknown id or a no-op", () => {
    const copy = moveInList(items, "a", 0);
    expect(copy).not.toBe(items);
    expect(copy.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(moveInList(items, "zzz", 1).map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(items.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("clamps out-of-range indices", () => {
    expect(moveInList(items, "a", 99).map((i) => i.id)).toEqual(["b", "c", "a"]);
    expect(moveInList(items, "c", -1).map((i) => i.id)).toEqual(["c", "a", "b"]);
  });
});

describe("sortOrderBefore", () => {
  it("lands one step below the lowest row, so a new capture is first and not tied", () => {
    const list = [task("a", { sortOrder: 10 }), task("b", { sortOrder: -3 }), task("c")];
    const fresh = task("fresh", { sortOrder: sortOrderBefore(list) });

    expect(fresh.sortOrder).toBeLessThan(-3);
    expect(ids(sortTasks([...list, fresh], "manual"))).toEqual(["fresh", "b", "c", "a"]);
  });

  it("starts below zero for an empty list, where the next row would default to 0", () => {
    expect(sortOrderBefore([])).toBeLessThan(0);
  });
});
