import type { LocalDate, Uuid, WeeklyGoal } from "@momentum/core/types";

import { rowToWeeklyGoal } from "../mappers/gamification";
import type { MomentumClient } from "../types";

/**
 * `weekly_goals` — the one read the planning drawer needs.
 *
 * Phase 5 shows a week's goals beside the work competing for it and stops
 * there: progress, claiming and the XP a goal awards are Phase 8's, and
 * `completed_at` is a guarded column that only `claim_weekly_goal()` writes
 * (Domain Rule 15). Nothing here writes.
 *
 * Plain function over a user-scoped client, domain type out. Ownership is not
 * re-checked: row-level security is the authorization, and the `user_id`
 * filter below is a query plan choice — `weekly_goals_uniq` leads with it —
 * not a second permission model (docs/ARCHITECTURE.md §4).
 */

/**
 * The goals set for one week, oldest first.
 *
 * `weekStart` is the week's first day in the profile's own week shape, which
 * is why the caller resolves it with `weekOf(date, profile.weekStart)` and
 * passes the date in: a Sunday-week user's Monday goal is filed under the
 * Sunday before it, and this function has no way to know that on its own.
 * Filed by the day it was created because that is the order the user made
 * the promises in, and a list that reshuffled itself on every edit would be
 * harder to read across a week than one that holds still.
 */
export async function listForWeek(
  client: MomentumClient,
  userId: Uuid,
  weekStart: LocalDate,
): Promise<WeeklyGoal[]> {
  const { data, error } = await client
    .from("weekly_goals")
    .select("*")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data.map(rowToWeeklyGoal);
}
