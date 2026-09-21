import { addDays, diffDays } from "../time";
import type { LocalDate } from "../types";

/**
 * A course's weeks are derived from its term, never stored: week N is the
 * seven days from `termStart + 7 * (N - 1)`, and the last week is cut at the
 * term's end. Pure calendar arithmetic; every date is already in the user's
 * timezone.
 */

/** The most weeks a term of at most a year can hold; `course_weeks_number_chk` says the same. */
export const MAX_COURSE_WEEKS = 53;

export interface CourseWeekSpan {
  /** 1-based. */
  number: number;
  start: LocalDate;
  /** Inclusive; the term's last day for the final week. */
  end: LocalDate;
}

/** How many weeks a term covers, counting a partial last week as one. */
export function courseWeekCount(termStart: LocalDate, termEnd: LocalDate): number {
  const days = diffDays(termStart, termEnd) + 1;
  if (days <= 0) return 0;
  return Math.min(MAX_COURSE_WEEKS, Math.ceil(days / 7));
}

/** Every week of the term, first to last. */
export function courseWeekSpans(termStart: LocalDate, termEnd: LocalDate): CourseWeekSpan[] {
  const count = courseWeekCount(termStart, termEnd);
  const spans: CourseWeekSpan[] = [];
  for (let number = 1; number <= count; number += 1) {
    const start = addDays(termStart, 7 * (number - 1));
    const end = addDays(start, 6);
    spans.push({ number, start, end: end > termEnd ? termEnd : end });
  }
  return spans;
}

/** The week `date` falls in, or null outside the term. */
export function courseWeekOf(
  date: LocalDate,
  termStart: LocalDate,
  termEnd: LocalDate,
): number | null {
  if (date < termStart || date > termEnd) return null;
  return Math.floor(diffDays(termStart, date) / 7) + 1;
}

export type CourseStatus = "upcoming" | "current" | "past";

/** Where today sits against the term. */
export function courseStatus(
  termStart: LocalDate,
  termEnd: LocalDate,
  today: LocalDate,
): CourseStatus {
  if (today < termStart) return "upcoming";
  if (today > termEnd) return "past";
  return "current";
}
