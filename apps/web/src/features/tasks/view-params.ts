import type { Route } from "next";

import { isTaskView, type TaskView } from "@momentum/core/tasks";
import type { Uuid } from "@momentum/core/types";

// Navigational state lives in search params; sort and filter do not
// (see `list-preferences.ts`).

export interface TaskParams {
  view: TaskView;
  /** Only meaningful for the `project` view; ignored elsewhere. */
  projectId: Uuid | null;
  /** The task whose detail sheet is open, if any. */
  taskId: Uuid | null;
  /** The palette's "New project" intent, honoured once by the page. */
  newProject: boolean;
}

/** The task page opens the dialog once, then replaces the URL without it. */
export const NEW_PROJECT_HREF = "/tasks?new=project" as Route;

export const DEFAULT_VIEW: TaskView = "inbox";

type ParamValue = string | string[] | undefined;

function first(value: ParamValue): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Anything unrecognised falls back to the default rather than erroring, and so
 * does a `project` view with no project id.
 */
export function parseTaskParams(params: Record<string, ParamValue>): TaskParams {
  const rawView = first(params.view);
  const projectId = first(params.project);
  const view = rawView !== null && isTaskView(rawView) ? rawView : DEFAULT_VIEW;

  return {
    view: view === "project" && projectId === null ? DEFAULT_VIEW : view,
    projectId,
    taskId: first(params.task),
    newProject: first(params.new) === "project",
  };
}

/** The href for a view. Omits every default so equal views produce equal addresses. */
export function taskHref(params: Partial<TaskParams>): Route {
  const search = new URLSearchParams();
  const view = params.view ?? DEFAULT_VIEW;

  if (view !== DEFAULT_VIEW) search.set("view", view);
  if (view === "project" && params.projectId) search.set("project", params.projectId);
  if (params.taskId) search.set("task", params.taskId);

  const query = search.toString();
  // `Route` covers the path; the search params are validated back by `parseTaskParams`.
  return (query === "" ? "/tasks" : `/tasks?${query}`) as Route;
}

export const VIEW_LABELS: Record<TaskView, string> = {
  inbox: "Inbox",
  today: "Today",
  upcoming: "Upcoming",
  all: "All tasks",
  completed: "Completed",
  project: "Project",
  archived: "Archived",
};

/** The toolbar's tabs. `project` is reached from the sidebar. */
export const TAB_VIEWS: readonly TaskView[] = [
  "inbox",
  "today",
  "upcoming",
  "all",
  "completed",
  "archived",
];
