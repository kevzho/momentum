import type { LocalDate, Uuid, WeeklyGoal } from "@momentum/core/types";

import { rowToWeeklyGoal } from "../mappers/gamification";
import type { MomentumClient } from "../types";

/**
 * The goals set for one week, oldest first. `weekStart` must be resolved by
 * the caller with `weekOf(date, profile.weekStart)`.
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
