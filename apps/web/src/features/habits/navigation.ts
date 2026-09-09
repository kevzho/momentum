import type { Route } from "next";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * "Add habit" from the command palette: the intent travels in the URL, the
 * page's island opens its form once and then replaces the URL without it.
 */
export const NEW_HABIT_HREF = "/habits?new=habit" as Route;

export function wantsNewHabit(searchParams: SearchParams): boolean {
  const value = searchParams.new;
  return (Array.isArray(value) ? value[0] : value) === "habit";
}
