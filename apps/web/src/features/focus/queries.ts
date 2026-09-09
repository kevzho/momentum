import "server-only";

import { focus, projects as projectsRepo, tasks } from "@momentum/db";
import { summariseFocus } from "@momentum/core/focus";
import { addDays, addMinutes, nowInstant, startOfDay, todayIn, weekOf } from "@momentum/core/time";
import type { Project, Task, Uuid } from "@momentum/core/types";

import {
  requestedMinutes,
  requestedTaskId,
  type FocusSearchParams,
} from "@/features/focus/search-params";
import type {
  FocusPageData,
  FocusSessionRow,
  FocusTaskOption,
  LiveFocusSession,
} from "@/features/focus/types";
import { requireSession } from "@/lib/auth/session";

/**
 * The focus page's one read.
 *
 * Four queries — the live session and its pauses, the sessions of this week and
 * the last, the open tasks, the projects — resolved together, and every date
 * question answered here in the profile timezone (Domain Rule 4). The client
 * receives dates and instants and does no date arithmetic of its own beyond the
 * timer, which is `@momentum/core/focus` (Domain Rule 5).
 *
 * `serverNow` travels with the payload for one specific reason: the timer is
 * derived from persisted timestamps and a reading of *some* clock, and the only
 * clock the browser has is the device's. Sending the server's instant lets the
 * client measure the difference once and correct for it, so a device four
 * minutes fast shows the session the database is actually timing.
 */

/**
 * How far back the history read reaches.
 *
 * This week for the totals, and the week before it so "recent sessions" has
 * something in it on a Monday morning. Anything longer is analytics
 * (Phase 10), and reading a user's whole history to render a page that shows
 * eight rows is a cost that grows for ever.
 */
const HISTORY_WEEKS_BACK = 1;

/** How many rows the recent list shows. */
export const RECENT_SESSION_LIMIT = 8;

/**
 * How many tasks the picker offers.
 *
 * A focus session is started for something the user is about to do, so the list
 * is short and ordered by what is most likely: overdue and soonest-due first,
 * then priority. A full task browser is what `/tasks` is for, and Phase 11's
 * palette will reach any task by name.
 */
export const TASK_OPTION_LIMIT = 40;

/**
 * How far back the XP line looks.
 *
 * The ledger's cap is a rolling window — `cap_xp_event` counts
 * `created_at > now() - interval '24 hours'` (docs/DOMAIN_RULES.md §21) — so
 * the figure the page shows against that cap is measured over the same window,
 * from the same clock. Measured over the local calendar day it read "0 of 300"
 * the morning after a long evening while the ledger was still refusing awards.
 */
const XP_CAP_WINDOW_MINUTES = 24 * 60;

export async function getFocusPage(params: FocusSearchParams = {}): Promise<FocusPageData> {
  const { supabase, userId, profile } = await requireSession();
  const timezone = profile.timezone;

  const serverNow = nowInstant();
  const today = todayIn(timezone, serverNow);
  const week = weekOf(today, profile.weekStart);

  // The window the history is read over, resolved exactly as the calendar's own
  // reads resolve a week: `startOfDay` knows that the local days either side of
  // a DST transition are 23 or 25 hours long.
  const historyWindow = {
    start: startOfDay(addDays(week.start, -7 * HISTORY_WEEKS_BACK), timezone),
    end: startOfDay(addDays(week.start, 7), timezone),
  };
  const capWindow = {
    start: addMinutes(serverNow, -XP_CAP_WINDOW_MINUTES),
    end: serverNow,
  };

  const [live, sessions, allTasks, projectRows, focusXpInCapWindow] = await Promise.all([
    focus.findLive(supabase, userId),
    focus.listStartedBetween(supabase, userId, historyWindow),
    tasks.listFor(supabase, userId),
    projectsRepo.listFor(supabase, userId),
    focus.focusXpAwardedBetween(supabase, userId, capWindow),
  ]);

  const byProject = new Map<Uuid, Project>(projectRows.map((project) => [project.id, project]));
  const toOption = (task: Task): FocusTaskOption => {
    const project = task.projectId === null ? undefined : byProject.get(task.projectId);
    return {
      id: task.id,
      title: task.title,
      priority: task.priority,
      estimatedMinutes: task.estimatedMinutes,
      actualMinutes: task.actualMinutes,
      projectId: task.projectId,
      projectName: project?.name ?? null,
      projectColor: project?.color ?? null,
    };
  };

  const optionById = new Map<Uuid, FocusTaskOption>(
    allTasks.map((task) => [task.id, toOption(task)]),
  );

  /*
   * The live session's own pauses. Read only when there is one, because the
   * table is empty for every other request and a join for a row that usually
   * does not exist is a query nobody needs.
   */
  const liveSession: LiveFocusSession | null =
    live === null
      ? null
      : {
          session: live,
          pauses: await focus.listPauses(supabase, live.id),
          task: live.taskId === null ? null : (optionById.get(live.taskId) ?? null),
        };

  const recent: FocusSessionRow[] = sessions.slice(0, RECENT_SESSION_LIMIT).map((session) => {
    const task = session.taskId === null ? null : (optionById.get(session.taskId) ?? null);
    const project = session.projectId === null ? undefined : byProject.get(session.projectId);
    return {
      session,
      // Resolved from the task at read time, so a renamed task renames its own
      // history rather than the session freezing yesterday's title
      // (docs/DOMAIN_RULES.md §19, the same rule as a block's title).
      taskTitle: task?.title ?? null,
      projectName: project?.name ?? null,
      projectColor: project?.color ?? null,
    };
  });

  return {
    serverNow,
    timezone,
    today,
    week: [...week.days],
    live: liveSession,
    history: summariseFocus({ sessions, timezone, today, week: week.days }),
    recent,
    projects: projectRows,
    tasks: candidateTasks(allTasks).map(toOption),
    requestedTaskId: requestedTaskId(params, (taskId) => optionById.has(taskId)),
    requestedMinutes: requestedMinutes(params),
    focusXpInCapWindow,
  };
}

/**
 * The tasks worth offering, soonest-needed first.
 *
 * Open, not archived, not a subtask — a subtask is a checklist item on the task
 * the user is actually working, and offering both would attribute the same
 * stretch of work to two rows. Ordered by due date with undated tasks last
 * (the nulls-last rule `@momentum/core/tasks` established, for the same reason:
 * a hundred undated tasks must not float above the three that are due), then by
 * priority, then by title so the order is stable between renders.
 */
function candidateTasks(all: readonly Task[]): Task[] {
  return all
    .filter((task) => task.status === "open" && task.parentTaskId === null)
    .sort((a, b) => {
      if (a.dueDate !== b.dueDate) {
        if (a.dueDate === null) return 1;
        if (b.dueDate === null) return -1;
        return a.dueDate < b.dueDate ? -1 : 1;
      }
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.title.localeCompare(b.title);
    })
    .slice(0, TASK_OPTION_LIMIT);
}
