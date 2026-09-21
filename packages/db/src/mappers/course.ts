import {
  COURSE_ITEM_KINDS,
  type Course,
  type CourseItem,
  type CourseItemKind,
  type CourseWeek,
} from "@momentum/core/types";

import type { Row } from "../types";
import { oneOf, toInstant, toInstantOrNull, toLocalDate, toLocalDateOrNull } from "./scalars";

export function rowToCourse(row: Row<"courses">): Course {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    code: row.code,
    instructor: row.instructor,
    location: row.location,
    syllabus: row.syllabus,
    syllabusPath: row.syllabus_path,
    syllabusFileName: row.syllabus_file_name,
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

export function rowToCourseItem(row: Row<"course_items">): CourseItem {
  return {
    id: row.id,
    userId: row.user_id,
    courseId: row.course_id,
    weekNumber: row.week_number,
    kind: oneOf<CourseItemKind>(COURSE_ITEM_KINDS, row.kind, "course_items.kind"),
    title: row.title,
    url: row.url,
    plannedOn: toLocalDateOrNull(row.planned_on),
    completedAt: toInstantOrNull(row.completed_at),
    sortOrder: row.sort_order,
    createdAt: toInstant(row.created_at),
    updatedAt: toInstant(row.updated_at),
  };
}
