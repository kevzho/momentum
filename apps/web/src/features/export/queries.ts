import "server-only";

import type { MomentumClient, Row } from "@momentum/db";

/**
 * Every user-owned table as the rows are stored: the mappers in `@momentum/db`
 * drop columns the app does not show. Ownership is enforced by row-level
 * security, so `select("*")` returns nothing but the caller's rows.
 */
export interface ExportTables {
  profiles: readonly Row<"profiles">[];
  projects: readonly Row<"projects">[];
  tasks: readonly Row<"tasks">[];
  calendar_blocks: readonly Row<"calendar_blocks">[];
  habits: readonly Row<"habits">[];
  habit_completions: readonly Row<"habit_completions">[];
  focus_sessions: readonly Row<"focus_sessions">[];
  focus_pauses: readonly Row<"focus_pauses">[];
  xp_events: readonly Row<"xp_events">[];
  user_achievements: readonly Row<"user_achievements">[];
  quest_assignments: readonly Row<"quest_assignments">[];
  weekly_goals: readonly Row<"weekly_goals">[];
  weekly_reviews: readonly Row<"weekly_reviews">[];
  user_cosmetics: readonly Row<"user_cosmetics">[];
}

export async function exportTablesFor(client: MomentumClient): Promise<ExportTables> {
  // Insertion order where the table records it; the rest in the order that reads as a history.
  const [
    profiles,
    projects,
    tasks,
    calendar_blocks,
    habits,
    habit_completions,
    focus_sessions,
    focus_pauses,
    xp_events,
    user_achievements,
    quest_assignments,
    weekly_goals,
    weekly_reviews,
    user_cosmetics,
  ] = await Promise.all([
    rows("profiles", client.from("profiles").select("*").order("created_at")),
    rows("projects", client.from("projects").select("*").order("created_at")),
    rows("tasks", client.from("tasks").select("*").order("created_at")),
    rows("calendar_blocks", client.from("calendar_blocks").select("*").order("created_at")),
    rows("habits", client.from("habits").select("*").order("created_at")),
    rows("habit_completions", client.from("habit_completions").select("*").order("completed_at")),
    rows("focus_sessions", client.from("focus_sessions").select("*").order("created_at")),
    rows("focus_pauses", client.from("focus_pauses").select("*").order("paused_at")),
    rows("xp_events", client.from("xp_events").select("*").order("created_at")),
    rows("user_achievements", client.from("user_achievements").select("*").order("unlocked_at")),
    rows("quest_assignments", client.from("quest_assignments").select("*").order("created_at")),
    rows("weekly_goals", client.from("weekly_goals").select("*").order("created_at")),
    rows("weekly_reviews", client.from("weekly_reviews").select("*").order("created_at")),
    rows("user_cosmetics", client.from("user_cosmetics").select("*").order("purchased_at")),
  ]);

  return {
    profiles,
    projects,
    tasks,
    calendar_blocks,
    habits,
    habit_completions,
    focus_sessions,
    focus_pauses,
    xp_events,
    user_achievements,
    quest_assignments,
    weekly_goals,
    weekly_reviews,
    user_cosmetics,
  };
}

/** A failed read is a bug or an outage, not a partial export: the route answers 500. */
async function rows<T>(
  table: string,
  query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(`Export could not read ${table}: ${error.message}`);
  return data ?? [];
}
