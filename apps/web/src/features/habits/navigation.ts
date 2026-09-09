import type { Route } from "next";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * "Add habit" from the command palette (Phase 11), by the same route the
 * calendar's "Add event" takes: the intent travels in the URL, the page's
 * island opens its form once and then replaces the URL without it.
 *
 * The habit form needs the user's habits to validate a name against and the
 * page's own mutation plumbing to commit through, so it opens where it lives
 * rather than being lifted into the shell for one command.
 */
export const NEW_HABIT_HREF = "/habits?new=habit" as Route;

export function wantsNewHabit(searchParams: SearchParams): boolean {
  const value = searchParams.new;
  return (Array.isArray(value) ? value[0] : value) === "habit";
}
