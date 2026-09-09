import { describe, expect, it, vi } from "vitest";

import { localDate } from "@momentum/core/time";
import type { Uuid } from "@momentum/core/types";
import { ListTodoIcon } from "lucide-react";

import type { ProjectSummaryWithCount, TaskSummary } from "@/features/tasks/types";
import { NO_USAGE, type CommandUsageMap } from "@/features/palette/recents";
import {
  RECENT_LIMIT,
  ROOT_TASK_LIMIT,
  countItems,
  firstItem,
  projectSections,
  rootSections,
  taskSections,
  type PaletteSection,
} from "@/features/palette/search";
import type { PaletteCommand } from "@/features/palette/types";

const NOW = 1_780_000_000_000;

function command(
  id: string,
  label: string,
  group: PaletteCommand["group"] = "action",
): PaletteCommand {
  return { id, group, label, icon: ListTodoIcon, run: vi.fn() };
}

const COMMANDS: readonly PaletteCommand[] = [
  command("navigate:/today", "Today", "navigate"),
  command("navigate:/calendar", "Calendar", "navigate"),
  command("tasks.create", "Add task", "create"),
  command("calendar.createEvent", "Add event", "create"),
  command("tasks.complete", "Complete task"),
  command("tasks.search", "Search tasks"),
];

const SCHOOL: ProjectSummaryWithCount = {
  id: "11111111-1111-4111-8111-111111111111" as Uuid,
  name: "School",
  color: "blue",
  openTasks: 3,
};
const RESEARCH: ProjectSummaryWithCount = {
  id: "22222222-2222-4222-8222-222222222222" as Uuid,
  name: "Research",
  color: "violet",
  openTasks: 1,
};
const PROJECTS = [SCHOOL, RESEARCH];

function task(id: string, title: string, projectId: Uuid | null = null): TaskSummary {
  return { id, title, projectId, priority: 4, dueDate: null };
}

const TASKS: readonly TaskSummary[] = [
  task("t1", "Physics problem set", SCHOOL.id),
  task("t2", "GVAE analysis", RESEARCH.id),
  task("t3", "Buy milk"),
];

function root(query: string, usage: CommandUsageMap = NO_USAGE): PaletteSection[] {
  return rootSections({
    query,
    commands: COMMANDS,
    tasks: TASKS,
    projects: PROJECTS,
    usage,
    now: NOW,
  });
}

function labels(sections: readonly PaletteSection[]): string[] {
  return sections.flatMap((section) =>
    section.items.map((item) =>
      item.kind === "command"
        ? item.command.label
        : item.kind === "task"
          ? item.task.title
          : item.project.name,
    ),
  );
}

describe("the resting list", () => {
  it("shows every command under its own heading and no user data", () => {
    const sections = root("");
    expect(sections.map((section) => section.heading)).toEqual(["Go to", "Create", "Actions"]);
    expect(countItems(sections)).toBe(COMMANDS.length);
  });

  it("surfaces recent commands first, and does not list them twice", () => {
    const usage: CommandUsageMap = {
      "tasks.complete": { uses: 4, lastUsedAt: NOW - 1_000 },
      "calendar.createEvent": { uses: 1, lastUsedAt: NOW - 2_000 },
    };
    const sections = root("", usage);

    expect(sections[0]?.heading).toBe("Recent");
    expect(labels([sections[0] as PaletteSection])).toEqual(["Complete task", "Add event"]);
    expect(labels(sections)).toHaveLength(COMMANDS.length);
  });

  it("shows at most a handful of recent commands", () => {
    const usage: CommandUsageMap = Object.fromEntries(
      COMMANDS.map((entry, index) => [entry.id, { uses: 1, lastUsedAt: NOW - index }]),
    );
    expect(root("", usage)[0]?.items).toHaveLength(RECENT_LIMIT);
  });

  it("ignores stored history for commands that no longer exist", () => {
    const usage: CommandUsageMap = { "removed.command": { uses: 9, lastUsedAt: NOW } };
    expect(root("", usage)[0]?.heading).toBe("Go to");
  });
});

describe("searching", () => {
  it("matches commands, tasks and projects in one list", () => {
    const found = labels(root("s"));
    expect(found).toContain("Search tasks");
    expect(found).toContain("Physics problem set");
    expect(found).toContain("School");
  });

  it("puts the section with the best match first", () => {
    expect(firstItem(root("physics"))).toMatchObject({ kind: "task" });
    expect(firstItem(root("calendar"))).toMatchObject({ kind: "command" });
    expect(firstItem(root("research"))).toMatchObject({ kind: "project" });
  });

  it("finds a task through its project's name", () => {
    expect(labels(root("resea"))).toContain("GVAE analysis");
  });

  it("returns nothing when nothing matches, rather than everything", () => {
    expect(countItems(root("zzzz"))).toBe(0);
  });

  it("lets history break a tie between two commands but not beat a better match", () => {
    const usage: CommandUsageMap = { "calendar.createEvent": { uses: 10, lastUsedAt: NOW } };
    // "Add event" is heavily used, but "Add task" is what was typed.
    expect(firstItem(root("add task", usage))).toMatchObject({
      kind: "command",
      command: { id: "tasks.create" },
    });
  });

  it("caps how many of the user's own rows the root list shows", () => {
    const many = Array.from({ length: 40 }, (_, index) =>
      task(`m${index}`, `Meeting note ${index}`),
    );
    const sections = rootSections({
      query: "meeting",
      commands: COMMANDS,
      tasks: many,
      projects: PROJECTS,
      usage: NO_USAGE,
      now: NOW,
    });
    expect(countItems(sections)).toBe(ROOT_TASK_LIMIT);
  });
});

describe("pickers", () => {
  it("lists every task when nothing has been typed", () => {
    expect(countItems(taskSections("", TASKS, PROJECTS))).toBe(TASKS.length);
  });

  it("narrows to what was typed", () => {
    expect(labels(taskSections("gvae", TASKS, PROJECTS))).toEqual(["GVAE analysis"]);
  });

  it("has no sections at all when nothing matches, so the empty state shows", () => {
    expect(taskSections("zzzz", TASKS, PROJECTS)).toEqual([]);
    expect(projectSections("zzzz", PROJECTS)).toEqual([]);
  });

  it("lists projects with their open counts", () => {
    const [section] = projectSections("school", PROJECTS);
    expect(section?.items[0]).toMatchObject({ kind: "project", project: { openTasks: 3 } });
  });
});

describe("stability", () => {
  it("gives the same answer for the same input", () => {
    expect(labels(root("ta"))).toEqual(labels(root("ta")));
  });

  it("keeps declaration order where scores tie", () => {
    const sections = root("");
    expect(labels([sections[0] as PaletteSection])).toEqual(["Today", "Calendar"]);
  });

  it("carries a due date and a project through to the item", () => {
    const due = { ...task("t4", "Essay", SCHOOL.id), dueDate: localDate("2026-09-11") };
    const sections = rootSections({
      query: "essay",
      commands: [],
      tasks: [due],
      projects: PROJECTS,
      usage: NO_USAGE,
      now: NOW,
    });
    expect(sections[0]?.items[0]).toMatchObject({
      kind: "task",
      task: { dueDate: "2026-09-11" },
      project: { name: "School" },
    });
  });
});
