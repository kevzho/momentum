"use server";

import { refresh, revalidatePath } from "next/cache";

import { courses, projects } from "@momentum/db";
import type { Course, CourseWeek } from "@momentum/core/types";

import {
  createCourseInput,
  deleteCourseInput,
  setCourseWeekInput,
  updateCourseInput,
  updateSyllabusInput,
} from "@/features/courses/schemas";
import {
  failure,
  success,
  validationError,
  type ActionErrorCode,
  type ActionResult,
} from "@/lib/actions/result";
import { requireSession } from "@/lib/auth/session";

/**
 * Course mutations. A course is a project plus a course row: creating one
 * writes both, editing one writes the project's name and colour and the
 * course's own fields, deleting one removes the course and its weeks and
 * leaves the project and its tasks where they are.
 */

export async function createCourse(input: unknown): Promise<ActionResult<Course>> {
  const parsed = createCourseInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, projectId, name, color, ...fields } = parsed.data;
  const { supabase, userId } = await requireSession();

  return attempt(async () => {
    // A retry after a lost response collides with itself on either primary
    // key; both collisions are the retry succeeding.
    const existing = await courses.findById(supabase, id);
    if (existing !== null) return existing;

    try {
      await projects.insert(supabase, { id: projectId, userId, name, color });
    } catch (error) {
      if (!isCode(error, UNIQUE_VIOLATION)) throw error;
    }

    try {
      return await courses.insert(supabase, { id, userId, projectId, ...fields });
    } catch (error) {
      // The course failed after the project was made: a project with no course
      // is a stray, so it is taken back before the failure is reported.
      await projects.remove(supabase, projectId).catch(() => undefined);
      throw error;
    }
  });
}

export async function updateCourse(input: unknown): Promise<ActionResult<Course>> {
  const parsed = updateCourseInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, name, color, ...fields } = parsed.data;
  const { supabase } = await requireSession();

  return attempt(async () => {
    const course = await courses.findById(supabase, id);
    if (course === null) throw notFound();
    await projects.update(supabase, course.projectId, { name, color });
    return courses.update(supabase, id, fields);
  });
}

export async function updateSyllabus(input: unknown): Promise<ActionResult<Course>> {
  const parsed = updateSyllabusInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, syllabus } = parsed.data;
  const { supabase } = await requireSession();

  return attempt(() => courses.update(supabase, id, { syllabus }));
}

/** The course and its weeks. The project and its tasks stay. */
export async function deleteCourse(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = deleteCourseInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id } = parsed.data;
  const { supabase } = await requireSession();

  return attempt(async () => {
    await courses.remove(supabase, id);
    return { id };
  });
}

/** Topic and material for one week; the first write creates the row. */
export async function setCourseWeek(input: unknown): Promise<ActionResult<CourseWeek>> {
  const parsed = setCourseWeekInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { supabase, userId } = await requireSession();

  return attempt(() => courses.upsertWeek(supabase, { userId, ...parsed.data }));
}

const UNIQUE_VIOLATION = "23505";

interface DatabaseError {
  code: string;
  message: string;
}

function notFound(): DatabaseError {
  return { code: "P0002", message: "That course no longer exists." };
}

function isDatabaseError(value: unknown): value is DatabaseError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof (value as { code: unknown }).code === "string" &&
    "message" in value &&
    typeof (value as { message: unknown }).message === "string"
  );
}

function isCode(error: unknown, code: string): boolean {
  return isDatabaseError(error) && error.code === code;
}

async function attempt<T>(operation: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await operation();
    // The sidebar and Quick Add read projects from the layout; the course pages read their own.
    refresh();
    revalidatePath("/courses");
    return success(data);
  } catch (error) {
    const mapped = describe(error);
    return failure(mapped.code, mapped.message);
  }
}

function describe(error: unknown): { code: ActionErrorCode; message: string } {
  if (!isDatabaseError(error)) {
    return { code: "unavailable", message: "Something went wrong. Please try again." };
  }

  switch (error.code) {
    case "42501":
      return { code: "forbidden", message: "That course belongs to another account." };
    case "P0002":
    case "PGRST116":
      return { code: "not_found", message: "That course no longer exists." };
    case "23514":
      return { code: "validation", message: constraintMessage(error.message) };
    case UNIQUE_VIOLATION:
      return { code: "conflict", message: "That project is already a course." };
    default:
      return {
        code: "unavailable",
        message: "Momentum could not save that change. Please try again.",
      };
  }
}

function constraintMessage(message: string): string {
  if (message.includes("courses_term_chk"))
    return "A term ends on or after it starts, within a year.";
  if (message.includes("projects_name_chk"))
    return "A course needs a name of at most 100 characters.";
  if (message.includes("courses_code_chk")) return "A course code is at most 20 characters.";
  return message;
}
