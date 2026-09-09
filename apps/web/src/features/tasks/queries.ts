import "server-only";

import { blocks, projects, tasks } from "@momentum/db";
import {
  diffDays,
  durationMinutes,
  localDateOf,
  minutesFromMidnight,
  nowInstant,
  todayIn,
} from "@momentum/core/time";
import { matchesView, sortOrderBefore } from "@momentum/core/tasks";
import type { CalendarBlock, Uuid, WorkBlock } from "@momentum/core/types";

import type {
  ProjectSummary,
  ProjectSummaryWithCount,
  ShellTaskData,
  TaskSummary,
  TaskWorkBlock,
  TasksPageData,
} from "@/features/tasks/types";
import { requireSession } from "@/lib/auth/session";

/**
 * The task manager's one read.
 *
 * Three queries, resolved together: the tasks, their work blocks, and the
 * projects. Every view, every count and every coverage number in the UI is
 * computed from this one result by the pure functions in
 * `@momentum/core/tasks` — there is no per-view query, because a view is a
 * filter and not a different question (specs/04-task-manager.md).
 *
 * `today` is read from the clock exactly once, here, in the profile timezone
 * (Domain Rule 4). The island is given it as a prop and never derives a second
 * one, which is also what keeps the server and client renders identical.
 */
const MINUTES_PER_DAY = 1440;

export async function getTasksPage(): Promise<TasksPageData> {
  const { supabase, userId, profile } = await requireSession();
  const timezone = profile.timezone;

  const [taskRows, projectRows] = await Promise.all([
    tasks.listFor(supabase, userId),
    projects.listFor(supabase, userId),
  ]);

  /*
   * Blocks are fetched for every task in one query rather than per task. The
   * detail sheet needs the full list for whichever task is opened, the row
   * needs the sum, and the toolbar's scheduled/unscheduled filter needs to know
   * which tasks have any at all — all three are the same read.
   */
  const workBlocks = await blocks.listForTasks(
    supabase,
    taskRows.map((task) => task.id),
  );

  return {
    today: todayIn(timezone, nowInstant()),
    timezone,
    tasks: taskRows,
    workBlocks: groupByTask(workBlocks, timezone),
    projects: projectRows.map(toSummary),
  };
}

/**
 * Blocks bucketed by the task they reserve time for — the shape Domain Rule 2
 * describes, made explicit for the client.
 *
 * The wall-clock fields are resolved here, on the server, with the profile
 * timezone. The alternative would be handing the client two instants and a
 * timezone and letting each surface convert them, which is exactly the ad-hoc
 * date maths in components that Domain Rule 5 exists to prevent.
 *
 * `date` is the day the block *starts* on. A block that runs past midnight
 * belongs to the day it began, which is the day the user placed it.
 */
function groupByTask(
  workBlocks: readonly CalendarBlock[],
  timezone: TasksPageData["timezone"],
): Record<Uuid, TaskWorkBlock[]> {
  const byTask: Record<Uuid, TaskWorkBlock[]> = {};

  for (const block of workBlocks) {
    if (!isWorkBlock(block)) continue;

    const startDate = localDateOf(block.startAt, timezone);
    const startMinutes = minutesFromMidnight(block.startAt, timezone);

    /*
     * The end, as a **wall-clock** reading measured from the start day's
     * midnight — not as the start plus the elapsed length.
     *
     * The two differ on exactly two days a year, and the difference matters
     * because this number is what the editor displays and what
     * `fromLocal(date, endMinutes, tz)` converts back. A block drawn 01:00–03:00
     * on a spring-forward morning is 60 elapsed minutes but still ends at 03:00
     * on the clock; `startMinutes + durationMinutes(...)` would show 02:00 and
     * would rewrite the block an hour shorter the first time the user touched
     * any other field on it.
     *
     * Adding a day per local-day boundary crossed is what keeps a block running
     * past midnight at 1470 rather than folding back to 30 and reading as one
     * that ends before it starts — the convention `endMinuteOfDay` already
     * accepts (up to 2880).
     */
    const endMinutes =
      minutesFromMidnight(block.endAt, timezone) +
      diffDays(startDate, localDateOf(block.endAt, timezone)) * MINUTES_PER_DAY;

    (byTask[block.taskId] ??= []).push({
      id: block.id,
      startAt: block.startAt,
      endAt: block.endAt,
      date: startDate,
      startMinutes,
      endMinutes,
      // Elapsed, not wall clock: this is what the block costs the week
      // (Domain Rule 3), and it is the number coverage is summed from.
      minutes: durationMinutes(block.startAt, block.endAt),
      completedAt: block.completedAt,
    });
  }

  return byTask;
}

function isWorkBlock(block: CalendarBlock): block is WorkBlock {
  return block.kind === "work";
}

function toSummary(project: {
  id: Uuid;
  name: string;
  color: ProjectSummary["color"];
}): ProjectSummary {
  return { id: project.id, name: project.name, color: project.color };
}

/* -------------------------------------------------------------------------- */
/* The shell's own read                                                       */
/* -------------------------------------------------------------------------- */

/**
 * What the shell itself needs from the task manager: the project list for the
 * sidebar and for Quick Add, and "today" for Quick Add's date picker.
 *
 * Separate from `getTasksPage` because it is read on every authenticated route,
 * not only on `/tasks` — Quick Add is two keystrokes from anywhere, and the
 * sidebar is always on screen. It is deliberately small: the counts are the
 * only aggregate, and they use the same `matchesView` predicate the task list
 * does, so the sidebar's number and the list's length can never disagree.
 */
export async function getShellTaskData(): Promise<ShellTaskData> {
  const { supabase, userId, profile } = await requireSession();
  const today = todayIn(profile.timezone, nowInstant());

  const [projectRows, taskRows] = await Promise.all([
    projects.listFor(supabase, userId),
    tasks.listFor(supabase, userId),
  ]);

  const openByProject = new Map<Uuid, number>();
  for (const task of taskRows) {
    if (task.projectId === null) continue;
    if (!matchesView(task, "project", { today, projectId: task.projectId })) continue;
    openByProject.set(task.projectId, (openByProject.get(task.projectId) ?? 0) + 1);
  }

  const summaries: ProjectSummaryWithCount[] = projectRows.map((project) => ({
    id: project.id,
    name: project.name,
    color: project.color,
    openTasks: openByProject.get(project.id) ?? 0,
  }));

  /*
   * The command palette's search index, narrowed from the rows already read
   * above. Completed tasks are left out: the palette's task commands are
   * "complete it", "schedule it" and "open it", and none of those is a question
   * anyone asks of a finished task. Subtasks stay in — they are work with a
   * title, and a person searching for one is searching for it by name.
   */
  const searchable: TaskSummary[] = taskRows
    .filter((task) => task.status === "open")
    .map((task) => ({
      id: task.id,
      title: task.title,
      projectId: task.projectId,
      priority: task.priority,
      dueDate: task.dueDate,
    }));

  return {
    today,
    projects: summaries,
    tasks: searchable,
    newTaskSortOrder: sortOrderBefore(taskRows),
  };
}
