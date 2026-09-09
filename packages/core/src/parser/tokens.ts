import { parseDuration } from "../time";
import type { Minutes, TaskPriority } from "../types";

/** Each matcher answers for one whitespace token and returns `null` for anything it is not certain about. */

const DURATION_TOKEN =
  /^(?:\d{1,6}(?:\.\d+)?(?:h|hr|hrs|hours?)(?:\d{1,2}(?:m|min|mins|minutes?)?)?|\d{1,6}(?:\.\d+)?(?:m|min|mins|minutes?))$/iu;

/** Must match `tasks_estimate_chk` and `createTaskInput`. A longer token stays in the title rather than being clamped. */
export const MAX_PARSED_MINUTES = 10_080;

/**
 * `15m` · `45min` · `90m` · `1h` · `1h30m` · `1h30` · `1.5h`. A bare number is
 * never a duration here ("Read chapter 3"), though `parseDuration` accepts one.
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
 * `#name` against the user's projects; an unknown tag stays in the title.
 * Comparison folds case, spaces, hyphens and underscores; first match wins.
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
