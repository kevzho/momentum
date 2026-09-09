import {
  COSMETIC_KINDS,
  QUEST_METRICS,
  QUEST_PERIODS,
  XP_SOURCE_TYPES,
  type AchievementDefinition,
  type CosmeticDefinition,
  type CosmeticKind,
  type QuestAssignment,
  type QuestDefinition,
  type QuestMetric,
  type QuestPeriod,
  type UserAchievement,
  type UserCosmetic,
  type WeeklyGoal,
  type XpEvent,
  type XpSourceType,
} from "@momentum/core/types";

import type { Row } from "../types";
import { oneOf, toInstant, toInstantOrNull, toLocalDate } from "./scalars";

export function rowToXpEvent(row: Row<"xp_events">): XpEvent {
  return {
    id: row.id,
    userId: row.user_id,
    sourceType: oneOf<XpSourceType>(XP_SOURCE_TYPES, row.source_type, "xp_events.source_type"),
    sourceId: row.source_id,
    amount: row.amount,
    reason: row.reason,
    createdAt: toInstant(row.created_at),
  };
}

export function rowToAchievementDefinition(
  row: Row<"achievement_definitions">,
): AchievementDefinition {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    sortOrder: row.sort_order,
  };
}

export function rowToUserAchievement(row: Row<"user_achievements">): UserAchievement {
  return {
    userId: row.user_id,
    achievementId: row.achievement_id,
    unlockedAt: toInstant(row.unlocked_at),
  };
}

export function rowToQuestDefinition(row: Row<"quest_definitions">): QuestDefinition {
  return {
    id: row.id,
    key: row.key,
    period: oneOf<QuestPeriod>(QUEST_PERIODS, row.period, "quest_definitions.period"),
    metric: oneOf<QuestMetric>(QUEST_METRICS, row.metric, "quest_definitions.metric"),
    target: row.target,
    xpReward: row.xp_reward,
    coinReward: row.coin_reward,
    title: row.title,
    description: row.description,
    active: row.active,
  };
}

export function rowToQuestAssignment(row: Row<"quest_assignments">): QuestAssignment {
  return {
    id: row.id,
    userId: row.user_id,
    questId: row.quest_id,
    period: oneOf<QuestPeriod>(QUEST_PERIODS, row.period, "quest_assignments.period"),
    periodStart: toLocalDate(row.period_start),
    slot: row.slot,
    completedAt: toInstantOrNull(row.completed_at),
    createdAt: toInstant(row.created_at),
  };
}

export function rowToWeeklyGoal(row: Row<"weekly_goals">): WeeklyGoal {
  return {
    id: row.id,
    userId: row.user_id,
    weekStart: toLocalDate(row.week_start),
    metric: oneOf<QuestMetric>(QUEST_METRICS, row.metric, "weekly_goals.metric"),
    target: row.target,
    title: row.title,
    completedAt: toInstantOrNull(row.completed_at),
    createdAt: toInstant(row.created_at),
    updatedAt: toInstant(row.updated_at),
  };
}

export function rowToCosmeticDefinition(row: Row<"cosmetic_definitions">): CosmeticDefinition {
  return {
    id: row.id,
    key: row.key,
    kind: oneOf<CosmeticKind>(COSMETIC_KINDS, row.kind, "cosmetic_definitions.kind"),
    name: row.name,
    description: row.description,
    price: row.price,
    sortOrder: row.sort_order,
    available: row.available,
  };
}

export function rowToUserCosmetic(row: Row<"user_cosmetics">): UserCosmetic {
  return {
    userId: row.user_id,
    cosmeticId: row.cosmetic_id,
    purchasedAt: toInstant(row.purchased_at),
    equipped: row.equipped,
  };
}
