import { describe, expect, it } from "vitest";

import {
  DEFAULT_VIEW,
  NEW_PROJECT_HREF,
  TAB_VIEWS,
  parseTaskParams,
  taskHref,
} from "@/features/tasks/view-params";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const TASK = "22222222-2222-4222-8222-222222222222";

describe("parseTaskParams", () => {
  it("defaults to the inbox with nothing open", () => {
    expect(parseTaskParams({})).toEqual({
      view: DEFAULT_VIEW,
      projectId: null,
      taskId: null,
      newProject: false,
    });
  });

  it("reads each of the seven views", () => {
    expect(TAB_VIEWS).toContain("archived");
    for (const view of [...TAB_VIEWS]) {
      expect(parseTaskParams({ view }).view).toBe(view);
    }
    expect(parseTaskParams({ view: "project", project: PROJECT })).toEqual({
      view: "project",
      projectId: PROJECT,
      taskId: null,
      newProject: false,
    });
  });

  it("reads the palette's new-project intent, and only that value", () => {
    expect(parseTaskParams({ new: "project" }).newProject).toBe(true);
    expect(parseTaskParams({ new: "habit" }).newProject).toBe(false);
    expect(NEW_PROJECT_HREF).toBe("/tasks?new=project");
  });

  it("falls back rather than erroring on a hand-edited or stale URL", () => {
    expect(parseTaskParams({ view: "someday" }).view).toBe(DEFAULT_VIEW);
    expect(parseTaskParams({ view: "" }).view).toBe(DEFAULT_VIEW);
  });

  it("downgrades a project view with no project, which would show nothing", () => {
    expect(parseTaskParams({ view: "project" }).view).toBe(DEFAULT_VIEW);
  });

  it("carries the open task", () => {
    expect(parseTaskParams({ view: "all", task: TASK }).taskId).toBe(TASK);
  });

  it("takes the first value when a parameter is repeated", () => {
    expect(parseTaskParams({ view: ["today", "all"] }).view).toBe("today");
  });
});

describe("taskHref", () => {
  it("omits every default, so the common links are short", () => {
    expect(taskHref({})).toBe("/tasks");
    expect(taskHref({ view: DEFAULT_VIEW })).toBe("/tasks");
  });

  it("names a non-default view", () => {
    expect(taskHref({ view: "today" })).toBe("/tasks?view=today");
  });

  it("carries a project only for the project view", () => {
    expect(taskHref({ view: "project", projectId: PROJECT })).toBe(
      `/tasks?view=project&project=${PROJECT}`,
    );
    expect(taskHref({ view: "today", projectId: PROJECT })).toBe("/tasks?view=today");
  });

  it("carries the open task", () => {
    expect(taskHref({ view: "all", taskId: TASK })).toBe(`/tasks?view=all&task=${TASK}`);
  });

  it("round-trips through parseTaskParams", () => {
    for (const params of [
      { view: "today" as const, projectId: null, taskId: null },
      { view: "project" as const, projectId: PROJECT, taskId: null },
      { view: "completed" as const, projectId: null, taskId: TASK },
    ]) {
      const url = new URL(taskHref(params), "https://example.test");
      const parsed = parseTaskParams(Object.fromEntries(url.searchParams));

      expect(parsed.view).toBe(params.view);
      expect(parsed.taskId).toBe(params.taskId);
      if (params.view === "project") expect(parsed.projectId).toBe(params.projectId);
    }
  });
});
