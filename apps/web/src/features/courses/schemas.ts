import { z } from "zod";

import { MAX_COURSE_WEEKS } from "@momentum/core/courses";
import { diffDays, isLocalDate, localDate } from "@momentum/core/time";
import { PROJECT_COLORS } from "@momentum/core/types";

/**
 * What the course actions accept. Bounds mirror the `courses` and
 * `course_weeks` check constraints and the project's name rule, so a form
 * that passes here is a row Postgres will accept.
 */

const uuid = z.uuid("That is not a valid id.");

const localDateField = z
  .string()
  .refine(isLocalDate, "Dates are YYYY-MM-DD.")
  .transform((value) => localDate(value));

/** Empty text is "nothing", never an empty string in the column. */
function optionalText(max: number, what: string) {
  return z
    .string()
    .trim()
    .max(max, `${what} is at most ${max} characters.`)
    .nullable()
    .default(null)
    .transform((value) => (value === "" ? null : value));
}

const courseFields = {
  name: z
    .string()
    .trim()
    .min(1, "Give the course a name.")
    .max(100, "Names are at most 100 characters."),
  color: z.enum(PROJECT_COLORS, "Pick one of the project colours."),
  code: optionalText(20, "A course code"),
  instructor: optionalText(100, "An instructor"),
  location: optionalText(100, "A location"),
  termStart: localDateField,
  termEnd: localDateField,
};

/** `courses_term_chk`: at least one day, less than a year. */
function orderedTerm<T extends { termStart: string; termEnd: string }>(schema: z.ZodType<T>) {
  return schema
    .refine((value) => value.termEnd >= value.termStart, {
      message: "The term has to end on or after the day it starts.",
      path: ["termEnd"],
    })
    .refine((value) => diffDays(localDate(value.termStart), localDate(value.termEnd)) < 366, {
      message: "A term is at most a year.",
      path: ["termEnd"],
    });
}

/** Both ids are client-generated so a retry collides with itself. */
export const createCourseInput = orderedTerm(
  z.object({ id: uuid, projectId: uuid, ...courseFields }),
);

export const updateCourseInput = orderedTerm(z.object({ id: uuid, ...courseFields }));

export const updateSyllabusInput = z.object({
  id: uuid,
  syllabus: optionalText(20000, "A syllabus"),
});

export const deleteCourseInput = z.object({ id: uuid });

export const setCourseWeekInput = z.object({
  courseId: uuid,
  weekNumber: z.number().int().min(1).max(MAX_COURSE_WEEKS),
  topic: optionalText(200, "A topic"),
  materials: optionalText(5000, "Material"),
});

export type CreateCourseInput = z.infer<typeof createCourseInput>;
export type UpdateCourseInput = z.infer<typeof updateCourseInput>;
export type SetCourseWeekInput = z.infer<typeof setCourseWeekInput>;
