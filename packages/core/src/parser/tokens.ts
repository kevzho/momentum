import { parseDuration } from "../time";
import type { Minutes, TaskPriority } from "../types";

/**
 * The four things Quick Add can recognise inside a line of text, and nothing
 * else (specs/11-command-palette.md). Each matcher answers for **one whitespace
 * token** and returns `null` for anything it is not certain about — certainty
 * being the whole point, because an uncertain match silently rewrites what the
 * user typed.
 */

/** Recognised, but only where a duration cannot be confused with a count. */
const DURATION_TOKEN =
  /^(?:\d{1,6}(?:\.\d+)?(?:h|hr|hrs|hours?)(?:\d{1,2}(?:m|min|mins|minutes?)?)?|\d{1,6}(?:\.\d+)?(?:m|min|mins|minutes?))$/iu;

/**
 * `tasks_estimate_chk` — and `createTaskInput` — cap an estimate at a week.
 * A token that reads as a longer duration is not one this product can store, so
 * it stays in the title rather than being clamped to something the user did not
 * type.
 */
export const MAX_PARSED_MINUTES = 10_080;

/**
 * `15m` · `45min` · `90m` · `1h` · `1h30m` · `1h30` · `1.5h`.
 *
 * **A bare number is never a duration here**, though `parseDuration` accepts
 * one: "Read chapter 3" ends in a number, and reading it as three minutes would
 * be exactly the silent rewrite this parser exists to avoid. A unit is what
 * turns a number into an intent. Once the token is *recognised*, the arithmetic
 * is `parseDuration`'s — there is one implementation of "what does 1h30 mean".
 */
export function matchDuration(text: string): Minutes | null {
  if (!DURATION_TOKEN.test(text)) return null;
  const minutes = parseDuration(text);
  if (minutes === null) return null;
  if (minutes <= 0 || minutes > MAX_PARSED_MINUTES) return null;
  return minutes;
}

const PRIORITY_TOKEN = /^p([1-4])$/iu;

/** `p1`–`p4`, case-insensitive. `p5`, `p0` and `p12` are words, not priorities. */
export function matchPriority(text: string): TaskPriority | null {
  const match = PRIORITY_TOKEN.exec(text);
  if (!match) return null;
  return Number(match[1]) as TaskPriority;
}

/**
 * `#name`, matched against the user's own projects and against nothing else.
 *
 * An unknown `#tag` is left in the title: Quick Add does not create projects
 * (a non-goal of this phase), so a token it cannot resolve is text the user
 * wrote, not an instruction it failed to follow.
 *
 * Comparison folds case, spaces, hyphens and underscores, so `#deep-work`,
 * `#deepwork` and `#Deep_Work` all reach a project called "Deep Work". The
 * first project that matches wins, which makes two identically-named projects
 * resolve by list order rather than by chance.
 */
export function matchProject<T extends { id: string; name: string }>(
  text: string,
  projects: readonly T[],
): T | null {
  if (!text.startsWith("#") || text.length < 2) return null;
  const wanted = foldProjectName(text.slice(1));
  if (wanted === "") return null;
  return projects.find((project) => foldProjectName(project.name) === wanted) ?? null;
}

function foldProjectName(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/gu, "");
}
