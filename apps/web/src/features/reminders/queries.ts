import "server-only";

import { blocks, courses, projects, tasks } from "@momentum/db";
import { expandAll } from "@momentum/core/recurrence";
import { addDays, nowInstant, startOfDay, todayIn } from "@momentum/core/time";
import type { Course, CourseItem, Project, Task, Uuid } from "@momentum/core/types";

import type {
  ReminderCourseItem,
  ReminderEvent,
  ReminderFeed,
  ReminderTask,
} from "@/features/reminders/types";
import { requireSession } from "@/lib/auth/session";

/**
 * The reminder feed: today's and tomorrow's events (occurrences expanded),
 * tasks due today or tomorrow, overdue tasks, and course entries planned for
 * today. Read by the app layout on every request and again by the scheduler
 * every few minutes, so it stays small and reads nothing it does not show.
 */
export async function getReminderFeed(): Promise<ReminderFeed> {
  const { supabase, userId, profile } = await requireSession();
  const timezone = profile.timezone;
  const today = todayIn(timezone, nowInstant());
  const tomorrow = addDays(today, 1);

  const window = {
    start: startOfDay(today, timezone),
    end: startOfDay(addDays(today, 2), timezone),
    startDate: today,
    endDate: tomorrow,
  };

  const [rows, dueRows, overdueRows, projectRows, courseRows, itemRows] = await Promise.all([
    blocks.listWindow(supabase, window),
    tasks.listDueBetween(supabase, userId, today, tomorrow),
    tasks.listOverdue(supabase, userId, today),
    projects.listFor(supabase, userId),
    courses.listFor(supabase, userId),
    courses.listItemsPlannedOn(supabase, userId, today),
  ]);

  const events: ReminderEvent[] = rows.blocks
    .filter((block) => block.kind === "event")
    .map((block) => ({
      id: block.id,
      title: block.title,
      startAt: block.startAt,
      endAt: block.endAt,
      allDay: block.allDay,
    }));
  for (const occurrence of expandAll(rows.series, window, rows.overrides)) {
    events.push({
      id: occurrence.id,
      title: occurrence.override?.title ?? occurrence.series.title,
      startAt: occurrence.startAt,
      endAt: occurrence.endAt,
      allDay: occurrence.override?.allDay ?? occurrence.series.allDay,
    });
  }
  events.sort((a, b) => (a.startAt < b.startAt ? -1 : a.startAt > b.startAt ? 1 : 0));

  const projectsById = new Map(projectRows.map((project) => [project.id, project]));
  const coursesByProject = new Map(courseRows.map((course) => [course.projectId, course]));
  const label = (task: Task): Pick<ReminderTask, "courseCode" | "projectName"> => {
    const project = task.projectId === null ? undefined : projectsById.get(task.projectId);
    const course = task.projectId === null ? undefined : coursesByProject.get(task.projectId);
    return { courseCode: course?.code ?? null, projectName: project?.name ?? null };
  };
  const toTask = (task: Task): ReminderTask | null =>
    task.dueDate === null
      ? null
      : { id: task.id, title: task.title, dueDate: task.dueDate, ...label(task) };

  return {
    today,
    timezone,
    events,
    tasks: dueRows.filter(isTopLevel).flatMap((task) => toTask(task) ?? []),
    overdue: overdueRows.filter(isTopLevel).flatMap((task) => toTask(task) ?? []),
    courseItems: itemRows.flatMap((item) => {
      const row = courseItem(item, coursesById(courseRows), projectsById);
      return row === null ? [] : [row];
    }),
  };
}

function isTopLevel(task: Task): boolean {
  return task.parentTaskId === null;
}

function coursesById(rows: readonly Course[]): ReadonlyMap<Uuid, Course> {
  return new Map(rows.map((course) => [course.id, course]));
}

function courseItem(
  item: CourseItem,
  byId: ReadonlyMap<Uuid, Course>,
  projectsById: ReadonlyMap<Uuid, Project>,
): ReminderCourseItem | null {
  const course = byId.get(item.courseId);
  const project = course === undefined ? undefined : projectsById.get(course.projectId);
  if (course === undefined || project === undefined || item.plannedOn === null) return null;
  return {
    id: item.id,
    title: item.title,
    courseCode: course.code,
    courseName: project.name,
    plannedOn: item.plannedOn,
    done: item.completedAt !== null,
  };
}
