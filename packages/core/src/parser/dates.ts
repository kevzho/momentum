import { addDays, diffDays, weekdayOf } from "../time";
import type { LocalDate, Weekday } from "../types";

/**
 * The relative dates Quick Add understands, resolved against a `today` that was
 * itself resolved in the user's timezone (Domain Rule 4). Nothing here reads a
 * clock, so "friday" means the same thing in the server render, in the client
 * re-render and in a test.
 */

/*
 * A `Map`, not an object literal: `WEEKDAY_WORDS["constructor"]` on an object
 * answers with something inherited, and a lookup keyed by whatever the user
 * typed is exactly where that matters.
 */
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

/**
 * Words that may sit immediately before a weekday and are absorbed into it.
 *
 * Without this, "essay next friday" would take `friday` and leave the title
 * reading "essay next" — text that is preserved, technically, and useless. Both
 * words resolve to the same day the bare weekday does: "the *next* such
 * weekday" is what the spec asks for, and inventing a second, week-later
 * meaning for one of the two spellings would be a guess the user cannot see.
 */
const WEEKDAY_QUALIFIERS: readonly string[] = ["next", "this", "on"];

export function isWeekdayQualifier(text: string): boolean {
  return WEEKDAY_QUALIFIERS.includes(text.toLowerCase());
}

/**
 * `today` · `tomorrow` · a weekday name or its common abbreviation.
 *
 * A weekday resolves to the **next** such weekday, strictly after today: on a
 * Friday, "friday" is a week away. That is what the word means when it is used
 * to schedule something — "today" and "tomorrow" exist for the two days it
 * would otherwise be ambiguous with, and a task the user meant to do today is
 * one word away either way.
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

/**
 * How a parsed date reads on its chip: "Today", "Tomorrow", the weekday name
 * while it is still this side of a week away, and a dated label beyond that.
 * The label always describes the resolved date, never the words that produced
 * it, so "friday" and "next friday" cannot chip differently.
 */
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
