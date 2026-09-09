import { describe, expect, it } from "vitest";

import { matchesView, selectTasks } from "@momentum/core/tasks";
import { ianaTimeZone, instant, localDate } from "@momentum/core/time";
import type { IanaTimeZone, Task } from "@momentum/core/types";

import { applyTaskPatch, newBlock } from "@/features/tasks/optimistic";
import type { TasksPageData, TaskWorkBlock } from "@/features/tasks/types";

/**
 * The overlay is what the user sees while a write is in flight, so what it says
 * has to be what the database will say a moment later. These tests pin the
 * places where "obvious" and "correct" differ — cascades, subtask project
 * inheritance, and the fact that completing a task leaves its blocks alone.
 */

const TZ: IanaTimeZone = ianaTimeZone("America/New_York");
const TODAY = localDate("2026-09-07");
const PROJECT = "11111111-1111-4111-8111-111111111111";

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    userId: "u",
    projectId: null,
    parentTaskId: null,
    title: id,
    description: null,
    status: "open",
    priority: 4,
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

function block(id: string, startAt: string, endAt: string): TaskWorkBlock {
  return {
    id,
    startAt: instant(startAt),
    endAt: instant(endAt),
    date: localDate(startAt.slice(0, 10)),
    startMinutes: 600,
    endMinutes: 660,
    minutes: 60,
    completedAt: null,
  };
}

function state(overrides: Partial<TasksPageData> = {}): TasksPageData {
  return {
    today: TODAY,
    timezone: TZ,
    tasks: [
      task("essay", { dueDate: TODAY, estimatedMinutes: 135 }),
      task("sub", { parentTaskId: "essay" }),
      task("other", { projectId: PROJECT }),
    ],
    workBlocks: {
      essay: [
        block("b1", "2026-09-07T14:00:00.000Z", "2026-09-07T14:45:00.000Z"),
        block("b2", "2026-09-08T15:00:00.000Z", "2026-09-08T16:00:00.000Z"),
      ],
    },
    projects: [{ id: PROJECT, name: "School", color: "indigo" }],
    ...overrides,
  };
}

const find = (s: TasksPageData, id: string): Task | undefined => s.tasks.find((t) => t.id === id);

describe("completion", () => {
  it("moves a task between views without any code that moves it", () => {
    const before = state();
    const context = { today: TODAY, projectId: null };

    expect(matchesView(find(before, "essay") as Task, "today", context)).toBe(true);
    expect(matchesView(find(before, "essay") as Task, "completed", context)).toBe(false);

    const after = applyTaskPatch(
      before,
      { kind: "completion", ids: ["essay"], completed: true },
      TZ,
    );

    expect(matchesView(find(after, "essay") as Task, "today", context)).toBe(false);
    expect(matchesView(find(after, "essay") as Task, "completed", context)).toBe(true);
    expect(selectTasks(after.tasks, "today", context)).toEqual([]);
  });

  it("sets both status and completedAt, which the database keeps in step", () => {
    const after = applyTaskPatch(
      state(),
      { kind: "completion", ids: ["essay"], completed: true },
      TZ,
    );
    const essay = find(after, "essay") as Task;

    expect(essay.status).toBe("completed");
    expect(essay.completedAt).not.toBeNull();
  });

  it("leaves the task's work blocks exactly as they were (Domain Rule 13)", () => {
    const before = state();
    const after = applyTaskPatch(
      before,
      { kind: "completion", ids: ["essay"], completed: true },
      TZ,
    );

    expect(after.workBlocks.essay).toEqual(before.workBlocks.essay);
    expect(after.workBlocks.essay).toHaveLength(2);
  });

  it("reopening clears the completion time", () => {
    const completed = applyTaskPatch(
      state(),
      { kind: "completion", ids: ["essay"], completed: true },
      TZ,
    );
    const reopened = applyTaskPatch(
      completed,
      { kind: "completion", ids: ["essay"], completed: false },
      TZ,
    );
    const essay = find(reopened, "essay") as Task;

    expect(essay.status).toBe("open");
    expect(essay.completedAt).toBeNull();
  });

  it("completes a whole selection in one patch", () => {
    const after = applyTaskPatch(
      state(),
      { kind: "completion", ids: ["essay", "other"], completed: true },
      TZ,
    );

    expect(find(after, "essay")?.status).toBe("completed");
    expect(find(after, "other")?.status).toBe("completed");
    expect(find(after, "sub")?.status).toBe("open");
  });

  it("never mutates the state it was given, which is what makes rollback free", () => {
    const before = state();
    const snapshot = JSON.stringify(before);

    applyTaskPatch(before, { kind: "completion", ids: ["essay"], completed: true }, TZ);
    applyTaskPatch(before, { kind: "delete", ids: ["essay"] }, TZ);

    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("delete", () => {
  it("takes the subtasks and the work blocks with it, as the cascade will", () => {
    const after = applyTaskPatch(state(), { kind: "delete", ids: ["essay"] }, TZ);

    expect(after.tasks.map((t) => t.id)).toEqual(["other"]);
    expect(after.workBlocks.essay).toBeUndefined();
  });

  it("deleting a subtask leaves the parent and its blocks alone", () => {
    const after = applyTaskPatch(state(), { kind: "delete", ids: ["sub"] }, TZ);

    expect(after.tasks.map((t) => t.id)).toEqual(["essay", "other"]);
    expect(after.workBlocks.essay).toHaveLength(2);
  });
});

describe("move to project", () => {
  it("moves the subtasks too, because the database rewrites them anyway", () => {
    const after = applyTaskPatch(
      state(),
      { kind: "move-project", ids: ["essay"], projectId: PROJECT },
      TZ,
    );

    expect(find(after, "essay")?.projectId).toBe(PROJECT);
    expect(find(after, "sub")?.projectId).toBe(PROJECT);
  });

  it("moves to no project", () => {
    const after = applyTaskPatch(
      state(),
      { kind: "move-project", ids: ["other"], projectId: null },
      TZ,
    );
    expect(find(after, "other")?.projectId).toBeNull();
  });
});

describe("work blocks", () => {
  it("adds one more block rather than replacing the existing ones (Domain Rule 2)", () => {
    const span = { date: localDate("2026-09-10"), startMinutes: 19 * 60, endMinutes: 19 * 60 + 30 };
    const after = applyTaskPatch(
      state(),
      { kind: "add-block", taskId: "essay", block: newBlock("b3", span, TZ) },
      TZ,
    );

    expect(after.workBlocks.essay).toHaveLength(3);
    expect(after.workBlocks.essay?.map((b) => b.id)).toEqual(["b1", "b2", "b3"]);
  });

  it("gives a task with no blocks its first one", () => {
    const span = { date: TODAY, startMinutes: 540, endMinutes: 600 };
    const after = applyTaskPatch(
      state(),
      { kind: "add-block", taskId: "other", block: newBlock("n1", span, TZ) },
      TZ,
    );

    expect(after.workBlocks.other).toHaveLength(1);
    expect(after.workBlocks.other?.[0]?.minutes).toBe(60);
  });

  it("keeps the list ordered by start, wherever the new block lands", () => {
    const span = { date: localDate("2026-09-01"), startMinutes: 540, endMinutes: 600 };
    const after = applyTaskPatch(
      state(),
      { kind: "add-block", taskId: "essay", block: newBlock("early", span, TZ) },
      TZ,
    );

    expect(after.workBlocks.essay?.map((b) => b.id)).toEqual(["early", "b1", "b2"]);
  });

  it("re-adding the same id replaces it, so a retry cannot duplicate (Domain Rule 17)", () => {
    const span = { date: TODAY, startMinutes: 540, endMinutes: 600 };
    const once = applyTaskPatch(
      state(),
      { kind: "add-block", taskId: "essay", block: newBlock("b3", span, TZ) },
      TZ,
    );
    const twice = applyTaskPatch(
      once,
      { kind: "add-block", taskId: "essay", block: newBlock("b3", span, TZ) },
      TZ,
    );

    expect(twice.workBlocks.essay).toHaveLength(3);
  });

  it("removing a block never touches the task", () => {
    const after = applyTaskPatch(
      state(),
      { kind: "remove-block", taskId: "essay", blockId: "b1" },
      TZ,
    );

    expect(after.workBlocks.essay?.map((b) => b.id)).toEqual(["b2"]);
    expect(find(after, "essay")).toEqual(find(state(), "essay"));
  });

  /*
   * The span `fromLocal` alone cannot resolve in order, and the reason this
   * file resolves both ends through `intervalOfSlot`: on 2026-03-08 in New York
   * 02:30 does not exist, so the start moves forward to 03:30 while the end
   * stays at 03:00. Two raw conversions come back inverted — the block draws
   * backwards and reports -30 minutes against the task's coverage — while the
   * row the server writes is an ordinary thirty minutes.
   * Mirrors packages/core/src/scheduling/intervals.test.ts.
   */
  it("keeps the drawn length for a block moved across the far edge of a spring-forward gap", () => {
    const after = applyTaskPatch(
      state(),
      {
        kind: "update-block",
        taskId: "essay",
        blockId: "b1",
        span: { date: localDate("2026-03-08"), startMinutes: 150, endMinutes: 180 },
      },
      TZ,
    );
    const moved = after.workBlocks.essay?.find((b) => b.id === "b1");

    expect(moved?.minutes).toBe(30);
    expect(moved?.startAt).toBe("2026-03-08T07:30:00.000Z");
    expect(moved?.endAt).toBe("2026-03-08T08:00:00.000Z");
  });

  it("gives a block created in that gap the same instants the server will write", () => {
    const span = { date: localDate("2026-03-08"), startMinutes: 150, endMinutes: 180 };
    const after = applyTaskPatch(
      state(),
      { kind: "add-block", taskId: "essay", block: newBlock("gap", span, TZ) },
      TZ,
    );
    const created = after.workBlocks.essay?.find((b) => b.id === "gap");

    expect(created?.minutes).toBe(30);
    expect(created?.startAt).toBe("2026-03-08T07:30:00.000Z");
    expect(created?.endAt).toBe("2026-03-08T08:00:00.000Z");
    // Still the wall clock the user set: the block reads 02:30 on its day even
    // though the instants say 03:30 (Domain Rule 5).
    expect(created?.startMinutes).toBe(150);
    expect(created?.endMinutes).toBe(180);
  });

  it("moving a block recomputes its length from the same wall clock the server will", () => {
    const after = applyTaskPatch(
      state(),
      {
        kind: "update-block",
        taskId: "essay",
        blockId: "b1",
        span: { date: localDate("2026-09-09"), startMinutes: 8 * 60, endMinutes: 9 * 60 + 30 },
      },
      TZ,
    );
    const moved = after.workBlocks.essay?.find((b) => b.id === "b1");

    expect(moved?.date).toBe("2026-09-09");
    expect(moved?.minutes).toBe(90);
  });
});

describe("reorder", () => {
  const ordered = [
    task("a", { sortOrder: 10 }),
    task("b", { sortOrder: 20 }),
    task("c", { sortOrder: 30 }),
  ];

  it("applies every row's new number, exactly as the action will persist them", () => {
    const after = applyTaskPatch(
      state({ tasks: ordered }),
      {
        kind: "reorder",
        orders: [
          { id: "a", sortOrder: 25 },
          { id: "c", sortOrder: 5 },
        ],
      },
      TZ,
    );

    expect(find(after, "a")?.sortOrder).toBe(25);
    expect(find(after, "c")?.sortOrder).toBe(5);
    expect(find(after, "b")?.sortOrder).toBe(20);
  });

  it("is a no-op when there is nothing to write", () => {
    const before = state({ tasks: ordered });
    expect(applyTaskPatch(before, { kind: "reorder", orders: [] }, TZ)).toBe(before);
  });
});

describe("create", () => {
  it("appends, and replaces in place on a retry with the same id", () => {
    const fresh = task("new", { title: "Read chapter 4" });
    const once = applyTaskPatch(state(), { kind: "create", task: fresh }, TZ);
    const twice = applyTaskPatch(
      once,
      { kind: "create", task: { ...fresh, title: "Renamed" } },
      TZ,
    );

    expect(once.tasks).toHaveLength(4);
    expect(twice.tasks).toHaveLength(4);
    expect(find(twice, "new")?.title).toBe("Renamed");
  });
});
