import { formatDuration, formatLocalDate } from "../time";
import type { LocalDate, Minutes, TaskPriority, Uuid } from "../types";

import { isWeekdayQualifier, isWithinAWeek, matchDate, relativeDayName } from "./dates";
import { matchDuration, matchPriority, matchProject } from "./tokens";

/**
 * Quick Add's natural-language parser. **Deterministic — there is no model
 * here** (specs/11-command-palette.md). The same string and the same `today`
 * always produce the same result, in the same microsecond, offline.
 *
 * ## The one rule
 *
 * **Metadata is a trailing run.** The parser reads tokens from the end of the
 * line and consumes them while they are metadata; the first token that is not
 * ends the scan, and everything to its left is the title, verbatim.
 *
 * That single rule is what makes the spec's own counter-example behave: in
 * "read p1 of the paper", `p1` is a page and not a priority, and the parser can
 * tell because words follow it. It is also how people type — "Finish essay
 * tomorrow 60m p1 #school" — and it means the user can always escape the parser
 * by writing one more word.
 *
 * ## What it will not do
 *
 * - **It never discards text.** Every character that is not part of a consumed
 *   token survives into the title, in the order and spelling it was typed.
 * - **It never guesses.** A `#tag` that matches no project, a bare number, a
 *   duration longer than the estimate column can hold, a second date after one
 *   has already been read — all of them stop the scan and stay in the title.
 * - **It never blocks typing.** It is a pure function over a string; a caller
 *   runs it on every keystroke and renders both its answer and the raw input.
 *
 * ## Rejecting a suggestion
 *
 * Parsing is a suggestion, so it has to be refusable. `dismissed` carries the
 * tokens the user has taken back: a dismissed token is *not* metadata, so its
 * text stays in the title exactly where it was written — and, because a
 * dismissal is not a wall, the scan continues past it to the tokens on its
 * left. Dismissals are keyed by kind and text rather than by position, so they
 * survive the user editing the front of the line.
 */

export type ParsedFieldKind = "date" | "duration" | "priority" | "project";

/** The subset of a project this parser needs; `ProjectSummary` satisfies it. */
export interface ParserProject {
  id: Uuid;
  name: string;
}

export interface QuickAddContext {
  /** Resolved once, in the user's timezone, by the caller (Domain Rule 4). */
  today: LocalDate;
  projects: readonly ParserProject[];
  /** Tokens the user has rejected. Order is irrelevant; duplicates are harmless. */
  dismissed?: readonly DismissedToken[];
}

/**
 * A rejected token, identified by *what it says* rather than by where it sat.
 * `text` is compared case-insensitively against the source text of a match.
 */
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

/**
 * Written out as four interfaces rather than as one intersection over a union,
 * so `kind` genuinely discriminates and `Extract` can pick a member.
 */
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

  /*
   * Right to left. `index` steps left one token at a time; a two-word phrase
   * ("next friday") consumes two and steps twice, which is why the loop moves
   * the cursor itself rather than relying on a `for`.
   */
  let index = spans.length - 1;
  while (index >= 0) {
    const span = spans[index];
    if (span === undefined) break;

    const match = matchToken(span, context);
    if (match === null) break;

    /*
     * "next friday" is one token as far as the user is concerned, so the
     * qualifier is absorbed *before* anything else looks at the match — a chip
     * that says "Friday" has to give back both words when it is dismissed.
     */
    const qualifier = match.kind === "date" ? qualifierBefore(spans, index) : null;
    const token: ParsedToken =
      qualifier === null ? match : { ...match, text: qualifier.text, start: qualifier.start };
    const width = qualifier === null ? 1 : 2;

    // Rejected: it is title text now, and the scan reads on past it.
    if (isDismissed(token, context.dismissed)) {
      index -= width;
      continue;
    }

    /*
     * Conflicting metadata — a second date, a second duration — stops the scan
     * rather than overwriting the one already read or silently dropping the
     * loser. The rightmost wins because it is the one the user typed last, and
     * the other stays visible in the title where they can see the conflict.
     */
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

/* -------------------------------------------------------------------------- */
/* Tokenising                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Whitespace-separated runs, with their offsets. `\s` under `u` covers the
 * whitespace a real keyboard produces — including the non-breaking space a
 * paste from a document brings with it — so a pasted line tokenises the same
 * way a typed one does.
 */
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

/* -------------------------------------------------------------------------- */
/* The residual title                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The input with the consumed spans cut out.
 *
 * Each cut takes the whitespace that separated the token from the text before
 * it — or, when nothing precedes it, the whitespace after — so removing a
 * trailing "60m" does not leave a trailing space and removing a leading one
 * does not leave a leading space. Whitespace *inside* the surviving text is
 * never touched: the user's spacing is theirs, and collapsing it would be a
 * quiet edit of the title.
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

/* -------------------------------------------------------------------------- */
/* Reading values back out                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A type predicate rather than a cast: `find(ofKind("date"))?.value` is a
 * `LocalDate` because the compiler proved it, not because the code asserted it.
 */
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
