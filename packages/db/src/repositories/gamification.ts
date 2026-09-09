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
 * Progression: the ledger, the definitions, and the four trusted writes.
 *
 * Reads and RPCs, and no third kind. `xp_events`, `user_achievements` and
 * `quest_assignments` are client-read-only, and `profiles.xp/level/coins` are
 * guarded columns (Domain Rule 15) — so there is no repository function here
 * that inserts an award, and there cannot be one. Every mutation below sends an
 * id; the amount is decided by
 * `20260907140000_gamification_functions.sql` (Domain Rule 6).
 *
 * The one ordinary write is `equipCosmetic`, and it is ordinary on purpose:
 * `user_cosmetics.equipped` is the single column a client may move, because
 * which of the things you already own you are wearing is not a fact the server
 * has any reason to arbitrate. Buying is a different question and goes through
 * `purchase_cosmetic()`, which debits coins in the same transaction.
 */

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The ledger, most recent first.
 *
 * The XP history a user can look at is the same rows the profile total is the
 * sum of — there is no second record of what was earned, which is what makes
 * "the total reconciles with the ledger" a statement about one table rather
 * than an agreement between two.
 */
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

/**
 * Unlocked achievements with the names they were unlocked for, in one query.
 *
 * The shell reads this on every authenticated request — the celebration
 * compares the set it renders with the last one it saw — so it joins the
 * definitions rather than fetching them separately. Six rows at most.
 */
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

/**
 * The cosmetic the user is wearing, of one kind.
 *
 * Read on every authenticated request for the top bar's avatar, so it is one
 * indexed lookup rather than the whole shop.
 */
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

/* -------------------------------------------------------------------------- */
/* Trusted writes                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Today's and this week's quests, assigning them if they do not exist yet.
 *
 * It takes no arguments, and that is the guarantee: the period is resolved from
 * the profile's own timezone and week-start preference inside the function, so
 * no caller can ask for a future day's quests or generate a hundred past days
 * of them.
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
 * Wears, or takes off, something already owned.
 *
 * An ordinary update: `equipped` is the one column `guard_user_cosmetics()`
 * lets a client move, and `enforce_one_equipped_per_kind()` un-equips the
 * previous one of that kind in the same statement — so two cosmetics of a kind
 * cannot both be on, even if a request fails between two of them.
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

/* -------------------------------------------------------------------------- */
/* Weekly goals — the one thing here the user creates                         */
/* -------------------------------------------------------------------------- */

export interface NewWeeklyGoal {
  id: Uuid;
  userId: Uuid;
  weekStart: LocalDate;
  metric: WeeklyGoal["metric"];
  target: number;
  title: string | null;
}

/** `id` is client-generated, so a retry after a lost response is idempotent (Domain Rule 17). */
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

  // The retry case: the row already exists with this id, so the create
  // succeeded and only the response was lost.
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
