import type {
  Course,
  CourseItem,
  CourseItemKind,
  CourseWeek,
  Instant,
  LocalDate,
  Uuid,
} from "@momentum/core/types";

import { rowToCourse, rowToCourseItem, rowToCourseWeek } from "../mappers/course";
import type { InsertRow, MomentumClient, UpdateRow } from "../types";

/**
 * Courses and their written weeks. A course's name, colour and tasks live on
 * its project; this repository never touches `projects` or `tasks`.
 */

/** Every course of the user, the one that started most recently first. */
export async function listFor(client: MomentumClient, userId: Uuid): Promise<Course[]> {
  const { data, error } = await client
    .from("courses")
    .select("*")
    .eq("user_id", userId)
    .order("term_start", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data.map(rowToCourse);
}

export async function findById(client: MomentumClient, id: Uuid): Promise<Course | null> {
  const { data, error } = await client.from("courses").select("*").eq("id", id).maybeSingle();

  if (error) throw error;
  return data === null ? null : rowToCourse(data);
}

/** `id` comes from the client so a retried insert collides with itself. */
export interface NewCourse {
  id?: Uuid;
  userId: Uuid;
  projectId: Uuid;
  code?: string | null;
  instructor?: string | null;
  location?: string | null;
  syllabus?: string | null;
  termStart: LocalDate;
  termEnd: LocalDate;
}

export interface CoursePatch {
  code?: string | null;
  instructor?: string | null;
  location?: string | null;
  syllabus?: string | null;
  /** Both or neither, as `courses_syllabus_file_chk` requires. */
  syllabusFile?: { path: string; fileName: string } | null;
  termStart?: LocalDate;
  termEnd?: LocalDate;
}

export async function insert(client: MomentumClient, course: NewCourse): Promise<Course> {
  const row: InsertRow<"courses"> = {
    user_id: course.userId,
    project_id: course.projectId,
    term_start: course.termStart,
    term_end: course.termEnd,
    ...(course.id === undefined ? {} : { id: course.id }),
    ...(course.code === undefined ? {} : { code: course.code }),
    ...(course.instructor === undefined ? {} : { instructor: course.instructor }),
    ...(course.location === undefined ? {} : { location: course.location }),
    ...(course.syllabus === undefined ? {} : { syllabus: course.syllabus }),
  };

  const { data, error } = await client.from("courses").insert(row).select("*").single();

  if (error) throw error;
  return rowToCourse(data);
}

export async function update(
  client: MomentumClient,
  id: Uuid,
  patch: CoursePatch,
): Promise<Course> {
  const row: UpdateRow<"courses"> = {
    ...(patch.code === undefined ? {} : { code: patch.code }),
    ...(patch.instructor === undefined ? {} : { instructor: patch.instructor }),
    ...(patch.location === undefined ? {} : { location: patch.location }),
    ...(patch.syllabus === undefined ? {} : { syllabus: patch.syllabus }),
    ...(patch.syllabusFile === undefined
      ? {}
      : {
          syllabus_path: patch.syllabusFile?.path ?? null,
          syllabus_file_name: patch.syllabusFile?.fileName ?? null,
        }),
    ...(patch.termStart === undefined ? {} : { term_start: patch.termStart }),
    ...(patch.termEnd === undefined ? {} : { term_end: patch.termEnd }),
  };

  const { data, error } = await client
    .from("courses")
    .update(row)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return rowToCourse(data);
}

/** Deletes the course and, by cascade, its weeks. The project and its tasks stay. */
export async function remove(client: MomentumClient, id: Uuid): Promise<void> {
  const { error } = await client.from("courses").delete().eq("id", id);
  if (error) throw error;
}

/** The written weeks of one course, in week order. */
export async function listWeeksFor(client: MomentumClient, courseId: Uuid): Promise<CourseWeek[]> {
  const { data, error } = await client
    .from("course_weeks")
    .select("*")
    .eq("course_id", courseId)
    .order("week_number", { ascending: true });

  if (error) throw error;
  return data.map(rowToCourseWeek);
}

export interface CourseWeekWrite {
  userId: Uuid;
  courseId: Uuid;
  weekNumber: number;
  topic: string | null;
  materials: string | null;
}

/** One row per (course, week): the first write creates it, every later one replaces its text. */
export async function upsertWeek(
  client: MomentumClient,
  week: CourseWeekWrite,
): Promise<CourseWeek> {
  const row: InsertRow<"course_weeks"> = {
    user_id: week.userId,
    course_id: week.courseId,
    week_number: week.weekNumber,
    topic: week.topic,
    materials: week.materials,
  };

  const { data, error } = await client
    .from("course_weeks")
    .upsert(row, { onConflict: "course_id,week_number" })
    .select("*")
    .single();

  if (error) throw error;
  return rowToCourseWeek(data);
}

// ---- Checklist items ---------------------------------------------------------

/** Every item of one course, in week and list order. */
export async function listItemsFor(client: MomentumClient, courseId: Uuid): Promise<CourseItem[]> {
  const { data, error } = await client
    .from("course_items")
    .select("*")
    .eq("course_id", courseId)
    .order("week_number", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data.map(rowToCourseItem);
}

/** Items planned for one date across every course of the user — Today's read. */
export async function listItemsPlannedOn(
  client: MomentumClient,
  userId: Uuid,
  date: LocalDate,
): Promise<CourseItem[]> {
  const { data, error } = await client
    .from("course_items")
    .select("*")
    .eq("user_id", userId)
    .eq("planned_on", date)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data.map(rowToCourseItem);
}

export async function findItemById(client: MomentumClient, id: Uuid): Promise<CourseItem | null> {
  const { data, error } = await client.from("course_items").select("*").eq("id", id).maybeSingle();

  if (error) throw error;
  return data === null ? null : rowToCourseItem(data);
}

export interface NewCourseItem {
  id?: Uuid;
  userId: Uuid;
  courseId: Uuid;
  weekNumber: number;
  kind: CourseItemKind;
  title: string;
  url: string | null;
  plannedOn: LocalDate | null;
  sortOrder: number;
}

export interface CourseItemPatch {
  kind?: CourseItemKind;
  title?: string;
  url?: string | null;
  plannedOn?: LocalDate | null;
  completedAt?: Instant | null;
  sortOrder?: number;
}

export async function insertItem(client: MomentumClient, item: NewCourseItem): Promise<CourseItem> {
  const row: InsertRow<"course_items"> = {
    user_id: item.userId,
    course_id: item.courseId,
    week_number: item.weekNumber,
    kind: item.kind,
    title: item.title,
    url: item.url,
    planned_on: item.plannedOn,
    sort_order: item.sortOrder,
    ...(item.id === undefined ? {} : { id: item.id }),
  };

  const { data, error } = await client.from("course_items").insert(row).select("*").single();

  if (error) throw error;
  return rowToCourseItem(data);
}

export async function updateItem(
  client: MomentumClient,
  id: Uuid,
  patch: CourseItemPatch,
): Promise<CourseItem> {
  const row: UpdateRow<"course_items"> = {
    ...(patch.kind === undefined ? {} : { kind: patch.kind }),
    ...(patch.title === undefined ? {} : { title: patch.title }),
    ...(patch.url === undefined ? {} : { url: patch.url }),
    ...(patch.plannedOn === undefined ? {} : { planned_on: patch.plannedOn }),
    ...(patch.completedAt === undefined ? {} : { completed_at: patch.completedAt }),
    ...(patch.sortOrder === undefined ? {} : { sort_order: patch.sortOrder }),
  };

  const { data, error } = await client
    .from("course_items")
    .update(row)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return rowToCourseItem(data);
}

export async function removeItem(client: MomentumClient, id: Uuid): Promise<void> {
  const { error } = await client.from("course_items").delete().eq("id", id);
  if (error) throw error;
}
