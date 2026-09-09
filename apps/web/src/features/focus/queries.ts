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
 * The focus page's one read, every date resolved in the profile timezone.
 * `serverNow` travels with the payload so the client can correct its own clock
 * against it once and show the session the database is actually timing.
 */

/** This week plus the one before, so "recent sessions" is not empty on a Monday morning. */
const HISTORY_WEEKS_BACK = 1;

/** How many rows the recent list shows. */
export const RECENT_SESSION_LIMIT = 8;

/** How many tasks the picker offers, soonest-due first. */
export const TASK_OPTION_LIMIT = 40;

/**
 * Must match `cap_xp_event`'s rolling window (`created_at > now() - interval
 * '24 hours'`), not the local calendar day, or the figure disagrees with the cap.
 */
const XP_CAP_WINDOW_MINUTES = 24 * 60;

export async function getFocusPage(params: FocusSearchParams = {}): Promise<FocusPageData> {
  const { supabase, userId, profile } = await requireSession();
  const timezone = profile.timezone;

  const serverNow = nowInstant();
  const today = todayIn(timezone, serverNow);
  const week = weekOf(today, profile.weekStart);

  // `startOfDay` handles the 23/25-hour local days either side of a DST transition.
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

  // Pauses are read only when there is a live session.
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
      // Resolved at read time, so a renamed task renames its own history.
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
 * Open top-level tasks (a subtask would attribute the same work to two rows),
 * ordered by due date with undated last, then priority, then title for stability.
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
