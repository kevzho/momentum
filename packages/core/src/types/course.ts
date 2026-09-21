import type { Instant, LocalDate, Uuid } from "./scalars";

/**
 * A course is a project with a term. The project holds the name, the colour
 * and the tasks — an assignment is a task in the course's project, due inside
 * one of its weeks — and this row holds what a project does not have.
 */
export interface Course {
  id: Uuid;
  userId: Uuid;
  projectId: Uuid;
  /** How the institution names it: "CHEM 101". */
  code: string | null;
  instructor: string | null;
  location: string | null;
  syllabus: string | null;
  /** Week 1 begins here; every week is seven days from it. */
  termStart: LocalDate;
  /** Inclusive. */
  termEnd: LocalDate;
  createdAt: Instant;
  updatedAt: Instant;
}

/** What the user wrote against week N of a course. A week with nothing written has no row. */
export interface CourseWeek {
  id: Uuid;
  userId: Uuid;
  courseId: Uuid;
  /** 1-based, counted from the term start. */
  weekNumber: number;
  topic: string | null;
  /** Readings, links, what to cover. Free text. */
  materials: string | null;
  createdAt: Instant;
  updatedAt: Instant;
}
