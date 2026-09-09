import { describe, expect, it } from "vitest";

import { instant, localDate } from "../time/scalars";
import type { Task, TaskPriority, TaskStatus } from "../types/task";
import type { LocalDate, Uuid } from "../types/scalars";
import {
  EMPTY_FILTER,
  TASK_VIEWS,
  filterByView,
  isEmptyFilter,
  isTaskView,
  matchesFilter,
  matchesView,
  selectTasks,
  type TaskView,
} from "./views";

const TODAY = localDate("2026-09-06");
const PROJECT_A = "11111111-1111-4111-8111-111111111111";
const PROJECT_B = "22222222-2222-4222-8222-222222222222";

function task(overrides: Partial<Task> & { id: string }): Task {
  return {
    userId: "00000000-0000-4000-8000-000000000000",
    projectId: null,
    parentTaskId: null,
    title: "A task",
    description: null,
    status: "open" as TaskStatus,
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

const OVERDUE = task({ id: "a", dueDate: localDate("2026-09-04") });
const DUE_TODAY = task({ id: "b", dueDate: TODAY });
const DUE_TOMORROW = task({ id: "c", dueDate: localDate("2026-09-07") });
const NO_DUE_NO_PROJECT = task({ id: "d" });
const IN_PROJECT = task({ id: "e", projectId: PROJECT_A, dueDate: localDate("2026-09-20") });
const OTHER_PROJECT = task({ id: "f", projectId: PROJECT_B });
const DONE = task({
  id: "g",
  status: "completed",
  completedAt: instant("2026-09-05T10:00:00.000Z"),
  projectId: PROJECT_A,
});
const ARCHIVED = task({
  id: "h",
  status: "archived",
  archivedAt: instant("2026-09-05T10:00:00.000Z"),
});
const SUBTASK = task({ id: "i", parentTaskId: "e", projectId: PROJECT_A });

const ALL = [
  OVERDUE,
  DUE_TODAY,
  DUE_TOMORROW,
  NO_DUE_NO_PROJECT,
  IN_PROJECT,
  OTHER_PROJECT,
  DONE,
  ARCHIVED,
  SUBTASK,
];

const context = { today: TODAY, projectId: PROJECT_A };

function idsIn(view: TaskView): string[] {
  return filterByView(ALL, view, context).map((t) => t.id);
}

describe("the seven views", () => {
  it("names exactly the six the spec lists, plus the archive", () => {
    expect([...TASK_VIEWS]).toEqual([
      "inbox",
      "today",
      "upcoming",
      "all",
      "completed",
      "project",
      "archived",
    ]);
    expect(isTaskView("inbox")).toBe(true);
    expect(isTaskView("someday")).toBe(false);
  });

  it("INBOX is open work with no project", () => {
    // The overdue and due-today fixtures have no project either.
    expect(idsIn("inbox")).toEqual(["a", "b", "c", "d"]);
  });

  it("TODAY includes overdue, because an overdue task is today's problem", () => {
    expect(idsIn("today")).toEqual(["a", "b"]);
  });

  it("UPCOMING is strictly after today, and excludes what is already due", () => {
    expect(idsIn("upcoming")).toEqual(["c", "e"]);
    expect(idsIn("upcoming")).not.toContain("b");
  });

  it("ALL is every open task regardless of due date or project", () => {
    expect(idsIn("all")).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("COMPLETED is the only view that shows completed tasks", () => {
    expect(idsIn("completed")).toEqual(["g"]);
    for (const view of TASK_VIEWS) {
      if (view === "completed") continue;
      expect(idsIn(view)).not.toContain("g");
    }
  });

  it("PROJECT shows that project's open work only", () => {
    expect(idsIn("project")).toEqual(["e"]);
    expect(
      filterByView(ALL, "project", { today: TODAY, projectId: PROJECT_B }).map((t) => t.id),
    ).toEqual(["f"]);
  });

  it("shows nothing in PROJECT when no project is selected, rather than everything", () => {
    expect(filterByView(ALL, "project", { today: TODAY, projectId: null })).toEqual([]);
    expect(filterByView(ALL, "project", { today: TODAY })).toEqual([]);
  });

  it("excludes archived tasks from every view but ARCHIVED", () => {
    for (const view of TASK_VIEWS) {
      if (view === "archived") continue;
      expect(idsIn(view)).not.toContain("h");
    }
  });

  it("ARCHIVED shows archived tasks and nothing else", () => {
    expect(idsIn("archived")).toEqual(["h"]);
    // Either column marks a row archived.
    const byTimestamp = task({ id: "j", archivedAt: instant("2026-09-05T10:00:00.000Z") });
    expect(matchesView(byTimestamp, "archived", context)).toBe(true);
    expect(matchesView(byTimestamp, "all", context)).toBe(false);
  });

  it("excludes subtasks from every view: they are shown inside their parent", () => {
    for (const view of TASK_VIEWS) {
      expect(idsIn(view)).not.toContain("i");
    }
  });

  it("never reads a work block: a due date is not a schedule (Domain Rule 1)", () => {
    const unscheduled = task({ id: "z", dueDate: TODAY });
    expect(matchesView(unscheduled, "today", context)).toBe(true);
    expect(matchesView({ ...unscheduled, estimatedMinutes: 120 }, "today", context)).toBe(true);
  });
});

describe("the toolbar filters", () => {
  const scheduled = new Set<Uuid>(["b", "e"]);

  it("starts empty and knows it", () => {
    expect(isEmptyFilter(EMPTY_FILTER)).toBe(true);
    expect(isEmptyFilter({ ...EMPTY_FILTER, priority: 1 })).toBe(false);
    expect(isEmptyFilter({ ...EMPTY_FILTER, search: "   " })).toBe(true);
  });

  it("filters by priority", () => {
    const p1 = task({ id: "p", priority: 1 });
    expect(matchesFilter(p1, { ...EMPTY_FILTER, priority: 1 }, scheduled)).toBe(true);
    expect(matchesFilter(p1, { ...EMPTY_FILTER, priority: 2 }, scheduled)).toBe(false);
  });

  it("answers scheduled-ness from the block set, never from the task", () => {
    expect(matchesFilter(DUE_TODAY, { ...EMPTY_FILTER, scheduled: "scheduled" }, scheduled)).toBe(
      true,
    );
    expect(matchesFilter(DUE_TODAY, { ...EMPTY_FILTER, scheduled: "unscheduled" }, scheduled)).toBe(
      false,
    );
    expect(matchesFilter(OVERDUE, { ...EMPTY_FILTER, scheduled: "unscheduled" }, scheduled)).toBe(
      true,
    );
    expect(matchesFilter(OVERDUE, { ...EMPTY_FILTER, scheduled: "any" }, scheduled)).toBe(true);
  });

  it("searches titles case-insensitively", () => {
    const essay = task({ id: "s", title: "History Essay" });
    expect(matchesFilter(essay, { ...EMPTY_FILTER, search: "essay" }, scheduled)).toBe(true);
    expect(matchesFilter(essay, { ...EMPTY_FILTER, search: "  HISTORY " }, scheduled)).toBe(true);
    expect(matchesFilter(essay, { ...EMPTY_FILTER, search: "chemistry" }, scheduled)).toBe(false);
  });

  it("narrows a view and never widens it", () => {
    const selected = selectTasks(
      ALL,
      "today",
      context,
      { ...EMPTY_FILTER, scheduled: "scheduled" },
      scheduled,
    );
    expect(selected.map((t) => t.id)).toEqual(["b"]);

    const widened = selectTasks(
      ALL,
      "today",
      context,
      { ...EMPTY_FILTER, projectId: PROJECT_A },
      scheduled,
    );
    expect(widened).toEqual([]);
  });
});

describe("timezone independence", () => {
  it("takes today as a parameter and reads no clock", () => {
    const yesterday: LocalDate = localDate("2026-09-05");
    expect(filterByView(ALL, "today", { today: yesterday }).map((t) => t.id)).toEqual(["a"]);
    expect(filterByView(ALL, "today", { today: TODAY }).map((t) => t.id)).toEqual(["a", "b"]);
  });
});
