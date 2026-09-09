import { formatDuration, formatLocalDate } from "../time";
import type { LocalDate, Minutes, TaskPriority, Uuid } from "../types";

import { isWeekdayQualifier, isWithinAWeek, matchDate, relativeDayName } from "./dates";
import { matchDuration, matchPriority, matchProject } from "./tokens";

/**
 * Quick Add's parser: deterministic, no model. Metadata is a trailing run:
 * tokens are read from the end of the line while they are metadata, the first
 * that is not ends the scan, and everything to its left is the title verbatim
 * ("read p1 of the paper" keeps `p1`). Nothing is discarded or guessed. A
 * dismissed token stays in the title and the scan continues past it.
 */

export type ParsedFieldKind = "date" | "duration" | "priority" | "project";

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
  /** How the chip reads: "Tomorrow", "1h 30m", "P1", "School". */
  label: string;
}

export interface ParsedDateToken extends ParsedTokenBase {
  kind: "date";
  value: LocalDate;
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

/** Four interfaces rather than an intersection over a union, so `kind` discriminates and `Extract` works. */
export type ParsedToken =
  ParsedDateToken | ParsedDurationToken | ParsedPriorityToken | ParsedProjectToken;

export interface QuickAddResult {
  /** Everything the parser did not take, trimmed. Never empty unless the input was. */
  title: string;
  /** Left to right, as they appear in the input — the order the chips render in. */
  tokens: readonly ParsedToken[];
  dueDate: LocalDate | null;
  estimatedMinutes: Minutes | null;
  priority: TaskPriority | null;
  projectId: Uuid | null;
}

const WHITESPACE = /\s/u;

export function parseQuickAdd(input: string, context: QuickAddContext): QuickAddResult {
  const spans = tokenize(input);
  const taken: ParsedToken[] = [];
  const filled = new Set<ParsedFieldKind>();

  // Right to left; a two-word phrase ("next friday") consumes two tokens.
  let index = spans.length - 1;
  while (index >= 0) {
    const span = spans[index];
    if (span === undefined) break;

    const match = matchToken(span, context);
    if (match === null) break;

    // The qualifier is absorbed before the dismissal check, so a dismissed chip gives back both words.
    const qualifier = match.kind === "date" ? qualifierBefore(spans, index) : null;
    const token: ParsedToken =
      qualifier === null ? match : { ...match, text: qualifier.text, start: qualifier.start };
    const width = qualifier === null ? 1 : 2;

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

function matchToken(span: TokenSpan, context: QuickAddContext): ParsedToken | null {
  const date = matchDate(span.text, context.today);
  if (date !== null) {
    return { ...span, kind: "date", value: date, label: dateLabel(date, context.today) };
  }

  const minutes = matchDuration(span.text);
  if (minutes !== null) {
    return { ...span, kind: "duration", value: minutes, label: formatDuration(minutes) };
  }

  const priority = matchPriority(span.text);
  if (priority !== null) {
    return { ...span, kind: "priority", value: priority, label: `P${priority}` };
  }

  const project = matchProject(span.text, context.projects);
  if (project !== null) {
    return { ...span, kind: "project", value: project, label: project.name };
  }

  return null;
}

/** "next" / "this" / "on" immediately before a weekday, absorbed into its span. */
function qualifierBefore(spans: readonly TokenSpan[], index: number): TokenSpan | null {
  const previous = spans[index - 1];
  if (previous === undefined || !isWeekdayQualifier(previous.text)) return null;
  const span = spans[index];
  if (span === undefined) return null;
  return { text: `${previous.text} ${span.text}`, start: previous.start, end: span.end };
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
