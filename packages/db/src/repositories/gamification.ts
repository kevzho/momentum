import type {
  AchievementDefinition,
  CosmeticDefinition,
  Instant,
  LocalDate,
  QuestAssignment,
  QuestDefinition,
  Uuid,
  UserAchievement,
  UserCosmetic,
  WeeklyGoal,
  XpEvent,
} from "@momentum/core/types";

import {
  rowToAchievementDefinition,
  rowToCosmeticDefinition,
  rowToQuestAssignment,
  rowToQuestDefinition,
  rowToUserAchievement,
  rowToUserCosmetic,
  rowToWeeklyGoal,
  rowToXpEvent,
} from "../mappers/gamification";
import { toInstant } from "../mappers/scalars";
import type { MomentumClient } from "../types";

/**
 * `xp_events`, `user_achievements` and `quest_assignments` are client-read-only
 * and `profiles.xp/level/coins` are guarded: every award is an RPC that decides
 * its own amount. Never add a function here that inserts an award.
 */

/** The ledger, most recent first. */
export async function listXpEvents(
  client: MomentumClient,
  userId: Uuid,
  limit: number,
): Promise<XpEvent[]> {
  const { data, error } = await client
    .from("xp_events")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .order("id", { ascending: false });

  if (error) throw error;
  return data.map(rowToXpEvent);
}

/** Everything awarded inside a window, by source. Used for the day's cap readouts. */
export async function xpAwardedBetween(
  client: MomentumClient,
  userId: Uuid,
  window: { start: Instant; end: Instant },
): Promise<{ sourceType: XpEvent["sourceType"]; amount: number }[]> {
  const { data, error } = await client
    .from("xp_events")
    .select("source_type, amount")
    .eq("user_id", userId)
    .gte("created_at", window.start)
    .lt("created_at", window.end);

  if (error) throw error;
  return data.map((row) => ({ sourceType: row.source_type, amount: row.amount }));
}

export async function listAchievementDefinitions(
  client: MomentumClient,
): Promise<AchievementDefinition[]> {
  const { data, error } = await client
    .from("achievement_definitions")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data.map(rowToAchievementDefinition);
}

export async function listUnlockedAchievements(
  client: MomentumClient,
  userId: Uuid,
): Promise<UserAchievement[]> {
  const { data, error } = await client
    .from("user_achievements")
    .select("*")
    .eq("user_id", userId)
    .order("unlocked_at", { ascending: false });

  if (error) throw error;
  return data.map(rowToUserAchievement);
}

/** Unlocked achievements joined with their names, newest first. */
export async function listUnlockedWithNames(
  client: MomentumClient,
  userId: Uuid,
): Promise<{ key: string; name: string; unlockedAt: Instant }[]> {
  const { data, error } = await client
    .from("user_achievements")
    .select("unlocked_at, achievement_definitions!inner(key, name)")
    .eq("user_id", userId)
    .order("unlocked_at", { ascending: false });

  if (error) throw error;
  return data.map((row) => ({
    key: row.achievement_definitions.key,
    name: row.achievement_definitions.name,
    unlockedAt: toInstant(row.unlocked_at),
  }));
}

export async function listQuestDefinitions(client: MomentumClient): Promise<QuestDefinition[]> {
  const { data, error } = await client
    .from("quest_definitions")
    .select("*")
    .order("key", { ascending: true });

  if (error) throw error;
  return data.map(rowToQuestDefinition);
}

export async function listCosmeticDefinitions(
  client: MomentumClient,
): Promise<CosmeticDefinition[]> {
  const { data, error } = await client
    .from("cosmetic_definitions")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data.map(rowToCosmeticDefinition);
}

export async function listOwnedCosmetics(
  client: MomentumClient,
  userId: Uuid,
): Promise<UserCosmetic[]> {
  const { data, error } = await client.from("user_cosmetics").select("*").eq("user_id", userId);

  if (error) throw error;
  return data.map(rowToUserCosmetic);
}

/** The key of the equipped cosmetic of one kind, or null. */
export async function equippedCosmeticKey(
  client: MomentumClient,
  userId: Uuid,
  kind: CosmeticDefinition["kind"],
): Promise<string | null> {
  const { data, error } = await client
    .from("user_cosmetics")
    .select("cosmetic_definitions!inner(key, kind)")
    .eq("user_id", userId)
    .eq("equipped", true)
    .eq("cosmetic_definitions.kind", kind)
    .maybeSingle();

  if (error) throw error;
  return data?.cosmetic_definitions.key ?? null;
}

/**
 * Today's and this week's quests, assigning them if needed. Takes no arguments
 * by design: the period is resolved server-side from the profile's timezone.
 */
export async function ensureQuests(client: MomentumClient): Promise<QuestAssignment[]> {
  const { data, error } = await client.rpc("ensure_quest_assignments");

  if (error) throw error;
  return data.map(rowToQuestAssignment);
}

/** Claims a finished quest. The server recomputes the progress; nothing is asserted here. */
export async function claimQuest(
  client: MomentumClient,
  assignmentId: Uuid,
): Promise<QuestAssignment> {
  const { data, error } = await client.rpc("claim_quest", { p_assignment_id: assignmentId });

  if (error) throw error;
  return rowToQuestAssignment(data);
}

export async function claimWeeklyGoal(client: MomentumClient, goalId: Uuid): Promise<WeeklyGoal> {
  const { data, error } = await client.rpc("claim_weekly_goal", { p_goal_id: goalId });

  if (error) throw error;
  return rowToWeeklyGoal(data);
}

/** Buys a cosmetic. Coins are checked and debited in the same transaction. */
export async function purchaseCosmetic(
  client: MomentumClient,
  cosmeticId: Uuid,
): Promise<UserCosmetic> {
  const { data, error } = await client.rpc("purchase_cosmetic", { p_cosmetic_id: cosmeticId });

  if (error) throw error;
  return rowToUserCosmetic(data);
}

/**
 * `equipped` is the one column `guard_user_cosmetics()` lets a client move;
 * `enforce_one_equipped_per_kind()` un-equips the previous one of that kind.
 */
export async function equipCosmetic(
  client: MomentumClient,
  userId: Uuid,
  cosmeticId: Uuid,
  equipped: boolean,
): Promise<UserCosmetic> {
  const { data, error } = await client
    .from("user_cosmetics")
    .update({ equipped })
    .eq("user_id", userId)
    .eq("cosmetic_id", cosmeticId)
    .select("*")
    .single();

  if (error) throw error;
  return rowToUserCosmetic(data);
}

export interface NewWeeklyGoal {
  id: Uuid;
  userId: Uuid;
  weekStart: LocalDate;
  metric: WeeklyGoal["metric"];
  target: number;
  title: string | null;
}

/** `id` is client-generated, so a retry after a lost response is idempotent. */
export async function insertWeeklyGoal(
  client: MomentumClient,
  goal: NewWeeklyGoal,
): Promise<WeeklyGoal> {
  const { data, error } = await client
    .from("weekly_goals")
    .upsert(
      {
        id: goal.id,
        user_id: goal.userId,
        week_start: goal.weekStart,
        metric: goal.metric,
        target: goal.target,
        title: goal.title,
      },
      { onConflict: "id", ignoreDuplicates: true },
    )
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (data !== null) return rowToWeeklyGoal(data);

  // Retry case: the row already exists, so only the response was lost.
  const existing = await findWeeklyGoal(client, goal.id);
  if (existing === null) throw new Error("weekly goal disappeared between insert and read");
  return existing;
}

export async function findWeeklyGoal(client: MomentumClient, id: Uuid): Promise<WeeklyGoal | null> {
  const { data, error } = await client.from("weekly_goals").select("*").eq("id", id).maybeSingle();

  if (error) throw error;
  return data === null ? null : rowToWeeklyGoal(data);
}

export async function removeWeeklyGoal(client: MomentumClient, id: Uuid): Promise<void> {
  const { error } = await client.from("weekly_goals").delete().eq("id", id);
  if (error) throw error;
}
