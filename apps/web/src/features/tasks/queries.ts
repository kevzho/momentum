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

const MINUTES_PER_DAY = 1440;

/**
 * The task manager's one read; every view is computed client-side from it.
 * `today` is read from the clock exactly once, here, in the profile timezone.
 */
export async function getTasksPage(): Promise<TasksPageData> {
  const { supabase, userId, profile } = await requireSession();
  const timezone = profile.timezone;

  const [liveRows, archivedRows, projectRows] = await Promise.all([
    tasks.listFor(supabase, userId),
    tasks.listArchivedFor(supabase, userId),
    projects.listFor(supabase, userId),
  ]);
  // One list: ARCHIVED is a view over it like the others.
  const taskRows = [...liveRows, ...archivedRows];

  const workBlocks = await blocks.listForTasks(
    supabase,
    taskRows.map((task) => task.id),
  );

  return {
    today: todayIn(timezone, nowInstant()),
    timezone,
    tasks: taskRows,
    workBlocks: groupByTask(workBlocks, timezone),
    projects: projectRows.filter(isActive).map(toSummary),
  };
}

/** Archived projects stay out of every list; their tasks keep pointing at them. */
function isActive(project: { archivedAt: unknown }): boolean {
  return project.archivedAt === null;
}

// Wall-clock fields are resolved here with the profile timezone so no
// component converts instants. `date` is the day the block starts on.
function groupByTask(
  workBlocks: readonly CalendarBlock[],
  timezone: TasksPageData["timezone"],
): Record<Uuid, TaskWorkBlock[]> {
  const byTask: Record<Uuid, TaskWorkBlock[]> = {};

  for (const block of workBlocks) {
    if (!isWorkBlock(block)) continue;

    const startDate = localDateOf(block.startAt, timezone);
    const startMinutes = minutesFromMidnight(block.startAt, timezone);

    // A wall-clock reading from the start day's midnight, not start + elapsed:
    // the two differ across DST (01:00–03:00 on a spring-forward morning is 60
    // elapsed minutes but still ends at 03:00), and this number is what the
    // editor shows and `fromLocal` converts back. Adding a day per local-day
    // boundary crossed keeps a block past midnight at 1470 rather than 30.
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
      // Elapsed, not wall clock: the number coverage is summed from.
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

/**
 * Read on every authenticated route, so deliberately small. Counts use the
 * same `matchesView` predicate as the list, so the two can never disagree.
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

  const summaries: ProjectSummaryWithCount[] = projectRows.filter(isActive).map((project) => ({
    id: project.id,
    name: project.name,
    color: project.color,
    openTasks: openByProject.get(project.id) ?? 0,
  }));

  // The palette's search index: open tasks only, subtasks included.
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
