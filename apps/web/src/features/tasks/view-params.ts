import type { Route } from "next";

import { isTaskView, type TaskView } from "@momentum/core/tasks";
import type { Uuid } from "@momentum/core/types";

/**
 * Which view, which project, which task is open — read from and written to the
 * URL.
 *
 * Navigational state lives in search params (docs/ARCHITECTURE.md §7), which is
 * what makes a view linkable, back-button-able and survivable across a refresh.
 * Sort and filter do *not* live here: the spec asks them to persist within a
 * session, not to be part of the address, and a URL carrying six parameters is
 * not one anybody shares.
 */

export interface TaskParams {
  view: TaskView;
  /** Only meaningful for the `project` view; ignored elsewhere. */
  projectId: Uuid | null;
  /** The task whose detail sheet is open, if any. */
  taskId: Uuid | null;
}

/** Where `/tasks` lands with no parameters. Inbox is where Quick Add's output goes. */
export const DEFAULT_VIEW: TaskView = "inbox";

type ParamValue = string | string[] | undefined;

function first(value: ParamValue): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Anything unrecognised falls back to the default rather than erroring: a
 * hand-edited or stale URL should show the user their tasks, not a 500.
 *
 * A `project` view with no project id is downgraded to the default too — the
 * view has nothing to show and `matchesView` would correctly return nothing,
 * which would read as an empty inbox rather than as a bad link.
 */
export function parseTaskParams(params: Record<string, ParamValue>): TaskParams {
  const rawView = first(params.view);
  const projectId = first(params.project);
  const view = rawView !== null && isTaskView(rawView) ? rawView : DEFAULT_VIEW;

  return {
    view: view === "project" && projectId === null ? DEFAULT_VIEW : view,
    projectId,
    taskId: first(params.task),
  };
}

/**
 * The href for a view. Omits every default, so the common links are short and
 * two routes to the same view produce the same address.
 */
export function taskHref(params: Partial<TaskParams>): Route {
  const search = new URLSearchParams();
  const view = params.view ?? DEFAULT_VIEW;

  if (view !== DEFAULT_VIEW) search.set("view", view);
  if (view === "project" && params.projectId) search.set("project", params.projectId);
  if (params.taskId) search.set("task", params.taskId);

  const query = search.toString();
  // A typed route with a query string: `Route` covers the path, and the search
  // params are the app's own, validated back by `parseTaskParams`.
  return (query === "" ? "/tasks" : `/tasks?${query}`) as Route;
}

export const VIEW_LABELS: Record<TaskView, string> = {
  inbox: "Inbox",
  today: "Today",
  upcoming: "Upcoming",
  all: "All tasks",
  completed: "Completed",
  project: "Project",
};

/** The five views the toolbar shows as tabs. `project` is reached from the sidebar. */
export const TAB_VIEWS: readonly TaskView[] = ["inbox", "today", "upcoming", "all", "completed"];
