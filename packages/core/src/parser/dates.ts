import { addDays, diffDays, weekdayOf } from "../time";
import type { LocalDate, Weekday } from "../types";

// A `Map`, not an object literal: the key is user-typed text, and an object would answer for "constructor".
const WEEKDAY_WORDS = new Map<string, Weekday>([
  ["sunday", 0],
  ["sun", 0],
  ["monday", 1],
  ["mon", 1],
  ["tuesday", 2],
  ["tues", 2],
  ["tue", 2],
  ["wednesday", 3],
  ["weds", 3],
  ["wed", 3],
  ["thursday", 4],
  ["thurs", 4],
  ["thur", 4],
  ["thu", 4],
  ["friday", 5],
  ["fri", 5],
  ["saturday", 6],
  ["sat", 6],
]);

/** Absorbed into a following weekday ("essay next friday"); they do not change the resolved day. */
const WEEKDAY_QUALIFIERS: readonly string[] = ["next", "this", "on"];

export function isWeekdayQualifier(text: string): boolean {
  return WEEKDAY_QUALIFIERS.includes(text.toLowerCase());
}

/**
 * `today` · `tomorrow` · a weekday name or abbreviation. A weekday resolves to
 * the next such weekday strictly after today: on a Friday, "friday" is a week away.
 */
export function matchDate(text: string, today: LocalDate): LocalDate | null {
  const word = text.toLowerCase();
  if (word === "today") return today;
  if (word === "tomorrow") return addDays(today, 1);

  const weekday = WEEKDAY_WORDS.get(word);
  if (weekday === undefined) return null;

  const ahead = (weekday - weekdayOf(today) + 7) % 7;
  return addDays(today, ahead === 0 ? 7 : ahead);
}

/** Chip label for a parsed date; describes the resolved date, never the words that produced it. */
export function relativeDayName(date: LocalDate, today: LocalDate): "Today" | "Tomorrow" | null {
  const days = diffDays(today, date);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return null;
}

export function isWithinAWeek(date: LocalDate, today: LocalDate): boolean {
  const days = diffDays(today, date);
  return days > 0 && days <= 7;
}
