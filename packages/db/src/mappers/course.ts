import type { Course, CourseWeek } from "@momentum/core/types";

import type { Row } from "../types";
import { toInstant, toLocalDate } from "./scalars";

export function rowToCourse(row: Row<"courses">): Course {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    code: row.code,
    instructor: row.instructor,
    location: row.location,
    syllabus: row.syllabus,
    termStart: toLocalDate(row.term_start),
    termEnd: toLocalDate(row.term_end),
    createdAt: toInstant(row.created_at),
    updatedAt: toInstant(row.updated_at),
  };
}

export function rowToCourseWeek(row: Row<"course_weeks">): CourseWeek {
  return {
    id: row.id,
    userId: row.user_id,
    courseId: row.course_id,
    weekNumber: row.week_number,
    topic: row.topic,
    materials: row.materials,
    createdAt: toInstant(row.created_at),
    updatedAt: toInstant(row.updated_at),
  };
}
