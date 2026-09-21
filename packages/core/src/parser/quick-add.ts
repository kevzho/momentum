import { formatDuration, formatLocalDate, formatMinutesOfDay } from "../time";
import type { LocalDate, Minutes, TaskPriority, Uuid } from "../types";

import {
  MAX_DATE_QUALIFIERS,
  MAX_DATE_WORDS,
  isDateQualifier,
  isWithinAWeek,
  matchDatePhrase,
  relativeDayName,
} from "./dates";
import { MAX_TIME_WORDS, isTimeQualifier, matchTimePhrase, type TimeOfDaySpan } from "./times";
import { matchDuration, matchPriority, matchProject } from "./tokens";

/**
 * Quick Add's parser: deterministic, no model. Metadata is a trailing run:
 * tokens are read from the end of the line while they are metadata, the first
 * that is not ends the scan, and everything to its left is the title verbatim
 * ("read p1 of the paper" keeps `p1`). Nothing is discarded or guessed. A
 * dismissed token stays in the title and the scan continues past it.
 *
 * A date or a time may be a phrase of up to three words ("oct 3 2026",
 * "9am to 11am"); the longest phrase ending at a word wins, and the
 * qualifiers written before it ("due", "at") are absorbed into its span.
 */

export type ParsedFieldKind = "date" | "time" | "duration" | "priority" | "project";

/** What a task capture reads. A task has a deadline, never a time of day. */
export const TASK_FIELDS: readonly ParsedFieldKind[] = ["date", "duration", "priority", "project"];

/** What an event capture reads: when it is, and how long. */
export const EVENT_FIELDS: readonly ParsedFieldKind[] = ["date", "time", "duration"];

/** The subset of a project this parser needs; `ProjectSummary` satisfies it. */
export interface ParserProject {
  id: Uuid;
  name: string;
}

export interface QuickAddContext {
  /** Resolved in the user's timezone by the caller. */
  today: LocalDate;
  projects: readonly ParserProject[];
  /** Tokens the user has rejected. Order is irrelevant; duplicates are harmless. */
  dismissed?: readonly DismissedToken[];
  /** Which kinds to read; anything else is title text. Defaults to `TASK_FIELDS`. */
  fields?: readonly ParsedFieldKind[];
}

/** A rejected token, identified by what it says rather than where it sat; `text` is compared case-insensitively. */
export interface DismissedToken {
  kind: ParsedFieldKind;
  text: string;
}

interface TokenSpan {
  /** The source text, exactly as typed — what returns to the title if rejected. */
  text: string;
  start: number;
  /** Exclusive. */
  end: number;
}

interface ParsedTokenBase extends TokenSpan {
  /** How the chip reads: "Tomorrow", "1h 30m", "P1", "School", "09:00 – 11:00". */
  label: string;
}

export interface ParsedDateToken extends ParsedTokenBase {
  kind: "date";
  value: LocalDate;
}

export interface ParsedTimeToken extends ParsedTokenBase {
  kind: "time";
  value: TimeOfDaySpan;
}

export interface ParsedDurationToken extends ParsedTokenBase {
  kind: "duration";
  value: Minutes;
}

export interface ParsedPriorityToken extends ParsedTokenBase {
  kind: "priority";
  value: TaskPriority;
}

export interface ParsedProjectToken extends ParsedTokenBase {
  kind: "project";
  value: ParserProject;
}

/** Five interfaces rather than an intersection over a union, so `kind` discriminates and `Extract` works. */
export type ParsedToken =
  | ParsedDateToken
  | ParsedTimeToken
  | ParsedDurationToken
  | ParsedPriorityToken
  | ParsedProjectToken;

export interface QuickAddResult {
  /** Everything the parser did not take, trimmed. Never empty unless the input was. */
  title: string;
  /** Left to right, as they appear in the input — the order the chips render in. */
  tokens: readonly ParsedToken[];
  dueDate: LocalDate | null;
  /** Read only when `fields` includes "time". */
  time: TimeOfDaySpan | null;
  estimatedMinutes: Minutes | null;
  priority: TaskPriority | null;
  projectId: Uuid | null;
}

const WHITESPACE = /\s/u;

export function parseQuickAdd(input: string, context: QuickAddContext): QuickAddResult {
  const spans = tokenize(input);
  const fields = new Set(context.fields ?? TASK_FIELDS);
  const taken: ParsedToken[] = [];
  const filled = new Set<ParsedFieldKind>();

  // Right to left; a phrase ("next friday", "oct 3", "9am to 11am") consumes several words.
  let index = spans.length - 1;
  while (index >= 0) {
    const match = matchEndingAt(spans, index, context, fields);
    if (match === null) break;

    const { token, width } = match;

    // Rejected: title text now, and the scan reads on past it.
    if (isDismissed(token, context.dismissed)) {
      index -= width;
      continue;
    }

    // A second token of the same kind stops the scan: the rightmost wins and the other stays in the title.
    if (filled.has(token.kind)) break;

    filled.add(token.kind);
    taken.push(token);
    index -= width;
  }

  taken.reverse();

  return {
    title: titleWithout(input, taken),
    tokens: taken,
    dueDate: taken.find(ofKind("date"))?.value ?? null,
    time: taken.find(ofKind("time"))?.value ?? null,
    estimatedMinutes: taken.find(ofKind("duration"))?.value ?? null,
    priority: taken.find(ofKind("priority"))?.value ?? null,
    projectId: taken.find(ofKind("project"))?.value.id ?? null,
  };
}

/** Whitespace-separated runs with their offsets. `\s` under `u` covers the non-breaking space a paste brings. */
function tokenize(input: string): TokenSpan[] {
  const spans: TokenSpan[] = [];
  const pattern = /\S+/gu;
  let match = pattern.exec(input);
  while (match !== null) {
    spans.push({ text: match[0], start: match.index, end: match.index + match[0].length });
    match = pattern.exec(input);
  }
  return spans;
}

interface PhraseMatch {
  token: ParsedToken;
  /** Words consumed, qualifiers included. */
  width: number;
}

/**
 * The longest metadata phrase ending at `index`. Dates and times are tried
 * at every width, longest first, so "oct 3" is one date and not a "3" left
 * behind a month; the one-word kinds are tried last.
 */
function matchEndingAt(
  spans: readonly TokenSpan[],
  index: number,
  context: QuickAddContext,
  fields: ReadonlySet<ParsedFieldKind>,
): PhraseMatch | null {
  const longest = Math.max(
    fields.has("date") ? MAX_DATE_WORDS : 0,
    fields.has("time") ? MAX_TIME_WORDS : 0,
  );

  for (let width = longest; width >= 1; width -= 1) {
    const first = index - width + 1;
    if (first < 0) continue;
    const words = spans.slice(first, index + 1);
    const texts = words.map((span) => span.text);

    if (fields.has("date") && width <= MAX_DATE_WORDS) {
      const date = matchDatePhrase(texts, context.today);
      if (date !== null) {
        const phrase = withQualifiers(spans, first, index, isDateQualifier, MAX_DATE_QUALIFIERS);
        return {
          token: {
            ...phrase.span,
            kind: "date",
            value: date,
            label: dateLabel(date, context.today),
          },
          width: phrase.width,
        };
      }
    }

    if (fields.has("time") && width <= MAX_TIME_WORDS) {
      const time = matchTimePhrase(texts);
      if (time !== null) {
        const phrase = withQualifiers(spans, first, index, isTimeQualifier, 1);
        return {
          token: { ...phrase.span, kind: "time", value: time, label: timeLabel(time) },
          width: phrase.width,
        };
      }
    }
  }

  const span = spans[index];
  if (span === undefined) return null;
  const token = matchWord(span, context, fields);
  return token === null ? null : { token, width: 1 };
}

/** The phrase at `first..index` plus the qualifiers written before it, as one span. */
function withQualifiers(
  spans: readonly TokenSpan[],
  first: number,
  index: number,
  isQualifier: (text: string) => boolean,
  maxQualifiers: number,
): { span: TokenSpan; width: number } {
  let start = first;
  while (start > 0 && first - start < maxQualifiers) {
    const previous = spans[start - 1];
    if (previous === undefined || !isQualifier(previous.text)) break;
    start -= 1;
  }

  const head = spans[start];
  const tail = spans[index];
  if (head === undefined || tail === undefined) throw new RangeError("Phrase out of range");

  const words = spans.slice(start, index + 1).map((word) => word.text);
  return {
    span: { text: words.join(" "), start: head.start, end: tail.end },
    width: index - start + 1,
  };
}

function matchWord(
  span: TokenSpan,
  context: QuickAddContext,
  fields: ReadonlySet<ParsedFieldKind>,
): ParsedToken | null {
  if (fields.has("duration")) {
    const minutes = matchDuration(span.text);
    if (minutes !== null) {
      return { ...span, kind: "duration", value: minutes, label: formatDuration(minutes) };
    }
  }

  if (fields.has("priority")) {
    const priority = matchPriority(span.text);
    if (priority !== null) {
      return { ...span, kind: "priority", value: priority, label: `P${priority}` };
    }
  }

  if (fields.has("project")) {
    const project = matchProject(span.text, context.projects);
    if (project !== null) {
      return { ...span, kind: "project", value: project, label: project.name };
    }
  }

  return null;
}

function isDismissed(
  token: ParsedToken,
  dismissed: readonly DismissedToken[] | undefined,
): boolean {
  if (dismissed === undefined) return false;
  const text = token.text.toLowerCase();
  return dismissed.some((entry) => entry.kind === token.kind && entry.text.toLowerCase() === text);
}

/**
 * The input with the consumed spans cut out. Each cut takes the whitespace
 * before the token (or after, when nothing precedes it); whitespace inside
 * the surviving text is never touched.
 */
function titleWithout(input: string, taken: readonly ParsedToken[]): string {
  let title = "";
  let cursor = 0;

  for (const token of taken) {
    let start = token.start;
    while (start > cursor && isWhitespaceAt(input, start - 1)) start -= 1;

    let end = token.end;
    if (start === cursor) {
      while (end < input.length && isWhitespaceAt(input, end)) end += 1;
    }

    title += input.slice(cursor, start);
    cursor = Math.max(cursor, end);
  }

  return (title + input.slice(cursor)).trim();
}

function isWhitespaceAt(input: string, index: number): boolean {
  const character = input[index];
  return character !== undefined && WHITESPACE.test(character);
}

/** A type predicate, so `find(ofKind("date"))?.value` narrows without a cast. */
function ofKind<K extends ParsedFieldKind>(
  kind: K,
): (token: ParsedToken) => token is Extract<ParsedToken, { kind: K }> {
  return (token): token is Extract<ParsedToken, { kind: K }> => token.kind === kind;
}

/** "Today" · "Tomorrow" · "Friday" · "Sep 21, 2026". */
function dateLabel(date: LocalDate, today: LocalDate): string {
  const relative = relativeDayName(date, today);
  if (relative !== null) return relative;
  if (isWithinAWeek(date, today)) return formatLocalDate(date, "weekdayLong");
  return formatLocalDate(date, "medium");
}

/** "09:00" · "09:00 – 11:00", the clock the grid is labelled in. */
function timeLabel(time: TimeOfDaySpan): string {
  const start = formatMinutesOfDay(time.startMinutes);
  return time.endMinutes === null ? start : `${start} – ${formatMinutesOfDay(time.endMinutes)}`;
}
