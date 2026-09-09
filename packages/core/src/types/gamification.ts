import type { Instant, LocalDate, Uuid } from "./scalars";

export const XP_SOURCE_TYPES = [
  "task",
  "focus_session",
  "habit_completion",
  "quest",
  "weekly_goal",
  "achievement",
] as const;
export type XpSourceType = (typeof XP_SOURCE_TYPES)[number];

/**
 * Append-only ledger. Unique per (user, sourceType, sourceId) so an event can be
 * rewarded at most once (Domain Rule 6). Rows are never deleted: XP is never
 * lost (Domain Rule 7).
 */
export interface XpEvent {
  id: Uuid;
  userId: Uuid;
  sourceType: XpSourceType;
  sourceId: Uuid | null;
  amount: number;
  reason: string;
  createdAt: Instant;
}

export interface AchievementDefinition {
  id: Uuid;
  key: string;
  name: string;
  description: string;
  sortOrder: number;
}

export interface UserAchievement {
  userId: Uuid;
  achievementId: Uuid;
  unlockedAt: Instant;
}

export const QUEST_PERIODS = ["daily", "weekly"] as const;
export type QuestPeriod = (typeof QUEST_PERIODS)[number];

/** Everything a quest or weekly goal can measure. Progress is derived from existing rows, never stored separately. */
export const QUEST_METRICS = [
  "tasks_completed",
  "priority_tasks_completed",
  "focus_minutes",
  "habits_completed",
  "habit_days",
  "blocks_completed",
] as const;
export type QuestMetric = (typeof QUEST_METRICS)[number];

export interface QuestDefinition {
  id: Uuid;
  key: string;
  period: QuestPeriod;
  metric: QuestMetric;
  /** Bounded by design: no quest may encourage unhealthy volumes of work (Domain Rule 7). */
  target: number;
  xpReward: number;
  coinReward: number;
  title: string;
  description: string;
  active: boolean;
}

/** The quests assigned to a user for a period. Generated deterministically from (user, periodStart). */
export interface QuestAssignment {
  id: Uuid;
  userId: Uuid;
  questId: Uuid;
  /** Which period the assignment belongs to; `periodStart` is a date in either. */
  period: QuestPeriod;
  periodStart: LocalDate;
  slot: number;
  completedAt: Instant | null;
  createdAt: Instant;
}

export interface WeeklyGoal {
  id: Uuid;
  userId: Uuid;
  weekStart: LocalDate;
  metric: QuestMetric;
  target: number;
  title: string | null;
  completedAt: Instant | null;
  createdAt: Instant;
  updatedAt: Instant;
}

export const COSMETIC_KINDS = ["profile_frame", "theme", "block_style", "avatar"] as const;
export type CosmeticKind = (typeof COSMETIC_KINDS)[number];

/** Coins buy cosmetics only — never functionality (specs/08-gamification.md). */
export interface CosmeticDefinition {
  id: Uuid;
  key: string;
  kind: CosmeticKind;
  name: string;
  description: string;
  price: number;
  sortOrder: number;
  /** Whether the shop may sell it: false until the product actually renders it. */
  available: boolean;
}

export interface UserCosmetic {
  userId: Uuid;
  cosmeticId: Uuid;
  purchasedAt: Instant;
  equipped: boolean;
}
