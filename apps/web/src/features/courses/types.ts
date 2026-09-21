import type { CourseStatus, CourseWeekSpan } from "@momentum/core/courses";
import type {
  Course,
  CourseWeek,
  LocalDate,
  ProjectColor,
  Task,
  Uuid,
  Weekday,
} from "@momentum/core/types";

/**
 * View models for the courses pages. Every date is a `LocalDate` resolved in
 * the profile timezone on the server; the islands read no clock.
 */

/** A course with the project fields it is named and coloured by. */
export interface CourseSummary {
  course: Course;
  name: string;
  color: ProjectColor;
  status: CourseStatus;
  /** The week today falls in, or null outside the term. */
  currentWeek: number | null;
  weekCount: number;
  /** Open, top-level tasks in the course's project. */
  openAssignments: number;
}

/** Everything `/courses` renders. */
export interface CoursesPageData {
  today: LocalDate;
  courses: readonly CourseSummary[];
}

/** One week of the term with what is written against it and what is due inside it. */
export interface CourseWeekView {
  span: CourseWeekSpan;
  /** The stored row, or null when nothing has been written for this week. */
  week: CourseWeek | null;
  /** Top-level tasks in the project due inside the span, soonest first. */
  assignments: readonly Task[];
  isCurrent: boolean;
}

/** Everything `/courses/[id]` renders. */
export interface CoursePageData {
  today: LocalDate;
  weekStart: Weekday;
  summary: CourseSummary;
  weeks: readonly CourseWeekView[];
  /** Top-level tasks in the project with no due date, or due outside the term. */
  unplaced: readonly Task[];
}

/** What the form collects; the project fields and the course fields together. */
export interface CourseFormValues {
  name: string;
  color: ProjectColor;
  code: string | null;
  instructor: string | null;
  location: string | null;
  termStart: LocalDate;
  termEnd: LocalDate;
}

/** A write to one week's text. */
export interface CourseWeekPatch {
  courseId: Uuid;
  weekNumber: number;
  topic: string | null;
  materials: string | null;
}
