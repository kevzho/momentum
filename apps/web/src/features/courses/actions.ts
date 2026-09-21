"use server";

import { refresh, revalidatePath } from "next/cache";

import { courses, projects } from "@momentum/db";
import { courseWeekSpans, isInSpan } from "@momentum/core/courses";
import { nowInstant } from "@momentum/core/time";
import type { Course, CourseItem, CourseWeek, LocalDate, Uuid } from "@momentum/core/types";

import {
  beginSyllabusUploadInput,
  createCourseInput,
  createCourseItemInput,
  deleteCourseInput,
  deleteCourseItemInput,
  finishSyllabusUploadInput,
  removeSyllabusFileInput,
  setCourseItemDoneInput,
  setCourseWeekInput,
  updateCourseInput,
  updateCourseItemInput,
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

// ---- Checklist items ---------------------------------------------------------

/** A reading, link or exercise on one week; `plannedOn` must lie inside that week. */
export async function createCourseItem(input: unknown): Promise<ActionResult<CourseItem>> {
  const parsed = createCourseItemInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, courseId, weekNumber, plannedOn, ...fields } = parsed.data;
  const { supabase, userId } = await requireSession();

  return attempt(async () => {
    const course = await courses.findById(supabase, courseId);
    if (course === null) throw notFound();
    assertInWeek(course, weekNumber, plannedOn);

    try {
      return await courses.insertItem(supabase, {
        id,
        userId,
        courseId,
        weekNumber,
        plannedOn,
        ...fields,
      });
    } catch (error) {
      if (!isCode(error, UNIQUE_VIOLATION)) throw error;
      const existing = await courses.findItemById(supabase, id);
      if (existing === null) throw error;
      return existing;
    }
  });
}

export async function updateCourseItem(input: unknown): Promise<ActionResult<CourseItem>> {
  const parsed = updateCourseItemInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, ...patch } = parsed.data;
  const { supabase } = await requireSession();

  return attempt(async () => {
    if (patch.plannedOn !== undefined && patch.plannedOn !== null) {
      const item = await courses.findItemById(supabase, id);
      if (item === null) throw notFound();
      const course = await courses.findById(supabase, item.courseId);
      if (course === null) throw notFound();
      assertInWeek(course, item.weekNumber, patch.plannedOn);
    }
    return courses.updateItem(supabase, id, patch);
  });
}

/** Ticking records the moment on the server's clock; nothing else changes and nothing is earned. */
export async function setCourseItemDone(input: unknown): Promise<ActionResult<CourseItem>> {
  const parsed = setCourseItemDoneInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, done } = parsed.data;
  const { supabase } = await requireSession();

  return attempt(() =>
    courses.updateItem(supabase, id, { completedAt: done ? nowInstant() : null }),
  );
}

export async function deleteCourseItem(input: unknown): Promise<ActionResult<{ id: Uuid }>> {
  const parsed = deleteCourseItemInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id } = parsed.data;
  const { supabase } = await requireSession();

  return attempt(async () => {
    await courses.removeItem(supabase, id);
    return { id };
  });
}

/** A planned day outside its week is a validation failure, not a row. */
function assertInWeek(course: Course, weekNumber: number, plannedOn: LocalDate | null): void {
  if (plannedOn === null) return;
  const span = courseWeekSpans(course.termStart, course.termEnd).find(
    (candidate) => candidate.number === weekNumber,
  );
  if (span === undefined || !isInSpan(plannedOn, span)) {
    throw { code: "23514", message: "course_items_planned_chk" } satisfies DatabaseError;
  }
}

// ---- The syllabus file -------------------------------------------------------

const SYLLABI_BUCKET = "syllabi";

export interface SyllabusUploadTicket {
  /** Where the browser PUTs the bytes; valid for a couple of hours. */
  signedUrl: string;
  /** The object path to hand back to `finishSyllabusUpload`. */
  path: string;
}

/**
 * Mints a one-time upload URL for the course's own folder. The browser
 * uploads straight to storage with it — the file never passes through a
 * server action, whose body limit is far below a PDF's size.
 */
export async function beginSyllabusUpload(
  input: unknown,
): Promise<ActionResult<SyllabusUploadTicket>> {
  const parsed = beginSyllabusUploadInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { courseId } = parsed.data;
  const { supabase, userId } = await requireSession();

  return attempt(async () => {
    const course = await courses.findById(supabase, courseId);
    if (course === null) throw notFound();

    const path = `${userId}/${courseId}/${crypto.randomUUID()}.pdf`;
    const { data, error } = await supabase.storage.from(SYLLABI_BUCKET).createSignedUploadUrl(path);
    if (error) throw storageError(error.message);
    return { signedUrl: data.signedUrl, path: data.path };
  });
}

/** Records the uploaded file on the course and removes the one it replaces. */
export async function finishSyllabusUpload(input: unknown): Promise<ActionResult<Course>> {
  const parsed = finishSyllabusUploadInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { courseId, path, fileName } = parsed.data;
  const { supabase, userId } = await requireSession();

  return attempt(async () => {
    const course = await courses.findById(supabase, courseId);
    if (course === null) throw notFound();
    // Only a path this account minted for this course is accepted.
    if (!path.startsWith(`${userId}/${courseId}/`) || !path.endsWith(".pdf")) {
      throw storageError("That file does not belong to this course.");
    }

    const { error } = await supabase.storage.from(SYLLABI_BUCKET).info(path);
    if (error) throw storageError("The upload did not arrive. Try again.");

    const updated = await courses.update(supabase, courseId, {
      syllabusFile: { path, fileName },
    });
    if (course.syllabusPath !== null && course.syllabusPath !== path) {
      // Best effort: a stray old file costs storage, not correctness.
      await supabase.storage.from(SYLLABI_BUCKET).remove([course.syllabusPath]);
    }
    return updated;
  });
}

export async function removeSyllabusFile(input: unknown): Promise<ActionResult<Course>> {
  const parsed = removeSyllabusFileInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { courseId } = parsed.data;
  const { supabase } = await requireSession();

  return attempt(async () => {
    const course = await courses.findById(supabase, courseId);
    if (course === null) throw notFound();
    const updated = await courses.update(supabase, courseId, { syllabusFile: null });
    if (course.syllabusPath !== null) {
      await supabase.storage.from(SYLLABI_BUCKET).remove([course.syllabusPath]);
    }
    return updated;
  });
}

function storageError(message: string): DatabaseError {
  return { code: "STORAGE", message };
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
    case "STORAGE":
      return { code: "unavailable", message: error.message };
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
  if (message.includes("course_items_planned_chk")) return "Pick a day inside that week.";
  if (message.includes("course_items_title_chk"))
    return "An item needs a title of at most 300 characters.";
  return message;
}
