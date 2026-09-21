import { addDays, diffDays, isLocalDate, localDate, weekdayOf } from "../time";
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

/** Month names and the abbreviations people actually write, 1-based. */
const MONTH_WORDS = new Map<string, number>([
  ["jan", 1],
  ["january", 1],
  ["feb", 2],
  ["february", 2],
  ["mar", 3],
  ["march", 3],
  ["apr", 4],
  ["april", 4],
  ["may", 5],
  ["jun", 6],
  ["june", 6],
  ["jul", 7],
  ["july", 7],
  ["aug", 8],
  ["august", 8],
  ["sep", 9],
  ["sept", 9],
  ["september", 9],
  ["oct", 10],
  ["october", 10],
  ["nov", 11],
  ["november", 11],
  ["dec", 12],
  ["december", 12],
]);

/**
 * Absorbed into a following date ("essay due friday", "test on oct 3"); they
 * do not change the resolved day. "due" and "by" are what a deadline is
 * written with, so a title never ends in a dangling "due".
 */
const DATE_QUALIFIERS: readonly string[] = ["due", "by", "on", "next", "this"];

/** How many qualifiers may precede a date: "due on friday", "due next monday". */
export const MAX_DATE_QUALIFIERS = 2;

/** The longest date phrase, in words: "oct 3 2026", "in 3 days". */
export const MAX_DATE_WORDS = 3;

export function isDateQualifier(text: string): boolean {
  return DATE_QUALIFIERS.includes(text.toLowerCase());
}

// `3`, `3rd`, `21st`, with the comma a written date carries ("Oct 3, 2026").
const DAY_OF_MONTH = /^(\d{1,2})(?:st|nd|rd|th)?,?$/iu;
const YEAR = /^\d{4}$/u;
// `9/25`, `9/25/26`, `9/25/2026` — month first, the convention every date in the product is rendered in.
const SLASH_DATE = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const COUNT = /^\d{1,3}$/u;

/**
 * One date phrase of one to three words, or null. Words are compared
 * case-insensitively; a month-and-day with no year is the next such date on
 * or after today, so "oct 3" typed in November means next year's.
 *
 * - `today` · `tomorrow` · a weekday name or abbreviation (the next such
 *   weekday strictly after today: on a Friday, "friday" is a week away)
 * - `next week` (a week from today) · `in 3 days` · `in 2 weeks`
 * - `9/25` · `9/25/26` · `9/25/2026` · `2026-09-25`
 * - `oct 3` · `oct 3rd` · `3 oct` · `october 3, 2026` · `3 october 2026`
 */
export function matchDatePhrase(words: readonly string[], today: LocalDate): LocalDate | null {
  const lower = words.map((word) => word.toLowerCase());
  const [first, second, third] = lower;
  if (first === undefined) return null;

  if (lower.length === 1) return matchSingleWord(first, today);

  if (lower.length === 2 && second !== undefined) {
    if (first === "next" && second === "week") return addDays(today, 7);
    return matchMonthDay(first, second, null, today);
  }

  if (lower.length === 3 && second !== undefined && third !== undefined) {
    if (first === "in") return matchRelative(second, third, today);
    if (!YEAR.test(third)) return null;
    return matchMonthDay(first, second, Number(third), today);
  }

  return null;
}

function matchSingleWord(word: string, today: LocalDate): LocalDate | null {
  if (word === "today") return today;
  if (word === "tomorrow") return addDays(today, 1);

  const weekday = WEEKDAY_WORDS.get(word);
  if (weekday !== undefined) {
    const ahead = (weekday - weekdayOf(today) + 7) % 7;
    return addDays(today, ahead === 0 ? 7 : ahead);
  }

  if (ISO_DATE.test(word)) return isLocalDate(word) ? localDate(word) : null;

  const slash = SLASH_DATE.exec(word);
  if (slash !== null) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    const year = slash[3] === undefined ? null : expandYear(slash[3]);
    return year === null ? nextOccurrence(month, day, today) : exactDate(year, month, day);
  }

  return null;
}

/** "oct 3" or "3 oct", with an optional year already split off. */
function matchMonthDay(
  first: string,
  second: string,
  year: number | null,
  today: LocalDate,
): LocalDate | null {
  const monthFirst = MONTH_WORDS.get(first);
  const monthSecond = MONTH_WORDS.get(second.replace(/,$/u, ""));

  let month: number;
  let dayText: string;
  if (monthFirst !== undefined && DAY_OF_MONTH.test(second)) {
    month = monthFirst;
    dayText = second;
  } else if (monthSecond !== undefined && DAY_OF_MONTH.test(first)) {
    month = monthSecond;
    dayText = first;
  } else {
    return null;
  }

  const day = Number(DAY_OF_MONTH.exec(dayText)?.[1]);
  return year === null ? nextOccurrence(month, day, today) : exactDate(year, month, day);
}

/** "in 3 days" · "in 2 weeks" · "in 1 day". */
function matchRelative(count: string, unit: string, today: LocalDate): LocalDate | null {
  if (!COUNT.test(count)) return null;
  const n = Number(count);
  if (n === 0) return null;
  if (unit === "day" || unit === "days") return addDays(today, n);
  if (unit === "week" || unit === "weeks") return addDays(today, n * 7);
  return null;
}

/** `26` → 2026. Two-digit years are this century; nobody types a deadline in 1926. */
function expandYear(text: string): number {
  return text.length === 4 ? Number(text) : 2000 + Number(text);
}

function exactDate(year: number, month: number, day: number): LocalDate | null {
  const text = `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
  return isLocalDate(text) ? localDate(text) : null;
}

/**
 * The next `month`/`day` on or after today. A date that does not exist this
 * year (Feb 29) is looked for in the years that follow; a day that exists in
 * no year (Feb 30) is not a date.
 */
function nextOccurrence(month: number, day: number, today: LocalDate): LocalDate | null {
  const thisYear = Number(today.slice(0, 4));
  for (let year = thisYear; year <= thisYear + 4; year += 1) {
    const candidate = exactDate(year, month, day);
    if (candidate !== null && candidate >= today) return candidate;
  }
  return null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * A whole string as one date — for a field that takes a typed date rather
 * than a title. Leading qualifiers are ignored, so "due fri" and "fri" agree.
 */
export function parseDatePhrase(text: string, today: LocalDate): LocalDate | null {
  const words = text
    .trim()
    .split(/\s+/u)
    .filter((word) => word !== "");
  // "next week" is a phrase before "next" is a qualifier, so the whole is tried first.
  for (let start = 0; start <= MAX_DATE_QUALIFIERS && start < words.length; start += 1) {
    const rest = words.slice(start);
    if (rest.length <= MAX_DATE_WORDS) {
      const date = matchDatePhrase(rest, today);
      if (date !== null) return date;
    }
    const word = words[start];
    if (word === undefined || !isDateQualifier(word)) break;
  }
  return null;
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
