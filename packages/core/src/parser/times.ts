import type { Minutes } from "../types";

/**
 * A wall-clock time of day, with or without an end, as typed for an event:
 * "9am", "9:30 am", "14:00", "9-11am", "2-3:30pm", "9am to 11am".
 */
export interface TimeOfDaySpan {
  startMinutes: Minutes;
  /** Null when only a start was written. */
  endMinutes: Minutes | null;
}

/** Absorbed into a following time ("exam at 9am"). */
const TIME_QUALIFIERS: readonly string[] = ["at", "from"];

/** The longest time phrase, in words: "9am to 11am", "9 - 11am". */
export const MAX_TIME_WORDS = 3;

export function isTimeQualifier(text: string): boolean {
  return TIME_QUALIFIERS.includes(text.toLowerCase());
}

type Meridiem = "am" | "pm";

interface ClockReading {
  hour: number;
  minute: number;
  meridiem: Meridiem | null;
  /** Whether minutes were written: "9:00" is a time on its own, "9" is not. */
  explicit: boolean;
}

// `9`, `9:30`, `9am`, `9:30pm`, `9.30am`, `12 pm` (the space is a separate word, joined by the caller).
const CLOCK = /^(\d{1,2})(?:[:.](\d{2}))?\s?(am|pm|a\.m\.|p\.m\.)?$/iu;
const MERIDIEM_WORD = /^(am|pm|a\.m\.|p\.m\.)$/iu;
// Hyphen, en dash or em dash between the two ends of a range.
const RANGE_SEPARATOR = /[-–—]/u;
const RANGE_WORDS: readonly string[] = ["-", "–", "—", "to"];

/**
 * One time phrase of one to three words, or null. A bare number is never a
 * time; it needs minutes or a meridiem. A range needs a meridiem on at least
 * one side, or minutes on both, so "pages 9-11" stays in a title. In a range
 * a meridiem on one side applies to the other, flipped when that would put
 * the end before the start: "11-1pm" is 11:00–13:00.
 */
export function matchTimePhrase(words: readonly string[]): TimeOfDaySpan | null {
  const [first, second, third] = words;
  if (first === undefined) return null;

  if (words.length === 1) {
    if (first === "noon") return { startMinutes: 720 as Minutes, endMinutes: null };
    const parts = first.split(RANGE_SEPARATOR);
    if (parts.length === 2 && parts[0] !== undefined && parts[1] !== undefined) {
      return matchRange(parts[0], parts[1]);
    }
    return single(readClock(first));
  }

  if (words.length === 2 && second !== undefined) {
    // "9 am" — the meridiem as its own word.
    if (MERIDIEM_WORD.test(second)) return single(readClock(`${first}${second}`));
    return null;
  }

  if (words.length === 3 && second !== undefined && third !== undefined) {
    if (!RANGE_WORDS.includes(second.toLowerCase())) return null;
    return matchRange(first, third);
  }

  return null;
}

function single(reading: ClockReading | null): TimeOfDaySpan | null {
  if (reading === null) return null;
  // "9" alone is a number; "9:00" or "9am" is a time.
  if (!reading.explicit && reading.meridiem === null) return null;
  const minutes = toMinutes(reading);
  return minutes === null ? null : { startMinutes: minutes, endMinutes: null };
}

function matchRange(startText: string, endText: string): TimeOfDaySpan | null {
  const start = readClock(startText);
  const end = readClock(endText);
  if (start === null || end === null) return null;

  const anyMeridiem = start.meridiem !== null || end.meridiem !== null;
  if (!anyMeridiem && !(start.explicit && end.explicit)) return null;

  // A meridiem written once covers both ends; if that puts the end first, the
  // unwritten side is the other half of the day.
  let resolvedStart = start;
  let resolvedEnd = end;
  if (start.meridiem === null && end.meridiem !== null) {
    resolvedStart = { ...start, meridiem: end.meridiem };
    if (compare(resolvedStart, resolvedEnd) >= 0) {
      resolvedStart = { ...start, meridiem: opposite(end.meridiem) };
    }
  } else if (end.meridiem === null && start.meridiem !== null) {
    resolvedEnd = { ...end, meridiem: start.meridiem };
    if (compare(resolvedStart, resolvedEnd) >= 0) {
      resolvedEnd = { ...end, meridiem: opposite(start.meridiem) };
    }
  }

  const startMinutes = toMinutes(resolvedStart);
  const endMinutes = toMinutes(resolvedEnd);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return null;
  return { startMinutes, endMinutes };
}

function readClock(text: string): ClockReading | null {
  const match = CLOCK.exec(text);
  if (match === null) return null;
  const hour = Number(match[1]);
  const minute = match[2] === undefined ? 0 : Number(match[2]);
  const meridiem = normalizeMeridiem(match[3]);
  if (minute > 59) return null;
  if (meridiem === null ? hour > 23 : hour < 1 || hour > 12) return null;
  return { hour, minute, meridiem, explicit: match[2] !== undefined };
}

function normalizeMeridiem(text: string | undefined): Meridiem | null {
  if (text === undefined) return null;
  return text.toLowerCase().startsWith("a") ? "am" : "pm";
}

function opposite(meridiem: Meridiem): Meridiem {
  return meridiem === "am" ? "pm" : "am";
}

function toMinutes(reading: ClockReading): Minutes | null {
  let hour = reading.hour;
  if (reading.meridiem === "am") hour = hour % 12;
  else if (reading.meridiem === "pm") hour = (hour % 12) + 12;
  if (hour > 23) return null;
  return (hour * 60 + reading.minute) as Minutes;
}

function compare(a: ClockReading, b: ClockReading): number {
  return (toMinutes(a) ?? 0) - (toMinutes(b) ?? 0);
}
