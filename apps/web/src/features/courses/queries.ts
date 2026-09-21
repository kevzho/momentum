import "server-only";

import { notFound } from "next/navigation";

import { courses, projects, tasks } from "@momentum/db";
import {
  courseStatus,
  courseWeekCount,
  courseWeekOf,
  courseWeekSpans,
} from "@momentum/core/courses";
import { nowInstant, todayIn } from "@momentum/core/time";
import type { Course, LocalDate, Project, Task, Uuid } from "@momentum/core/types";

import type {
  CoursePageData,
  CourseSummary,
  CourseWeekView,
  CoursesPageData,
} from "@/features/courses/types";
import { requireSession } from "@/lib/auth/session";

/**
 * The courses pages' reads. A course's assignments are its project's
 * top-level tasks; nothing here reads a second table for them. "Today"
 * resolves once per request in the profile timezone.
 */

export async function getCoursesPage(): Promise<CoursesPageData> {
  const { supabase, userId, profile } = await requireSession();
  const today = todayIn(profile.timezone, nowInstant());

  const [courseRows, projectRows, taskRows] = await Promise.all([
    courses.listFor(supabase, userId),
    projects.listFor(supabase, userId),
    tasks.listFor(supabase, userId),
  ]);

  const byProject = new Map(projectRows.map((project) => [project.id, project]));
  const summaries: CourseSummary[] = [];
  for (const course of courseRows) {
    const project = byProject.get(course.projectId);
    // A course whose project is archived is out of every list, like the project itself.
    if (project === undefined || project.archivedAt !== null) continue;
    summaries.push(summarise(course, project, assignmentsOf(taskRows, project.id), today));
  }

  // Current terms first, then upcoming, then past; each most recent first.
  const rank = { current: 0, upcoming: 1, past: 2 } as const;
  summaries.sort((a, b) => rank[a.status] - rank[b.status]);

  return { today, courses: summaries };
}

export async function getCoursePage(id: Uuid): Promise<CoursePageData> {
  const { supabase, userId, profile } = await requireSession();
  const today = todayIn(profile.timezone, nowInstant());

  const course = await courses.findById(supabase, id);
  if (course === null) notFound();

  const [project, weekRows, taskRows] = await Promise.all([
    projects.findById(supabase, course.projectId),
    courses.listWeeksFor(supabase, course.id),
    tasks.listFor(supabase, userId),
  ]);
  if (project === null) notFound();

  const assignments = assignmentsOf(taskRows, project.id);
  const written = new Map(weekRows.map((row) => [row.weekNumber, row]));
  const currentWeek = courseWeekOf(today, course.termStart, course.termEnd);

  const weeks: CourseWeekView[] = courseWeekSpans(course.termStart, course.termEnd).map((span) => ({
    span,
    week: written.get(span.number) ?? null,
    assignments: assignments
      .filter(
        (task) => task.dueDate !== null && task.dueDate >= span.start && task.dueDate <= span.end,
      )
      .sort(byDueThenTitle),
    isCurrent: span.number === currentWeek,
  }));

  const unplaced = assignments
    .filter(
      (task) =>
        task.dueDate === null || task.dueDate < course.termStart || task.dueDate > course.termEnd,
    )
    .sort(byDueThenTitle);

  return {
    today,
    weekStart: profile.weekStart,
    summary: summarise(course, project, assignments, today),
    weeks,
    unplaced,
  };
}

function summarise(
  course: Course,
  project: Project,
  assignments: readonly Task[],
  today: LocalDate,
): CourseSummary {
  return {
    course,
    name: project.name,
    color: project.color,
    status: courseStatus(course.termStart, course.termEnd, today),
    currentWeek: courseWeekOf(today, course.termStart, course.termEnd),
    weekCount: courseWeekCount(course.termStart, course.termEnd),
    openAssignments: assignments.filter((task) => task.status === "open").length,
  };
}

/** The project's top-level tasks; `listFor` has already left archived ones out. */
function assignmentsOf(rows: readonly Task[], projectId: Uuid): Task[] {
  return rows.filter((task) => task.projectId === projectId && task.parentTaskId === null);
}

/** Soonest due first; a task with no due date sorts last; ties by title. */
function byDueThenTitle(a: Task, b: Task): number {
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  return a.title.localeCompare(b.title);
}
