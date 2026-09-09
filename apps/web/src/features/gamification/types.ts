import type {
  AchievementDefinition,
  CosmeticDefinition,
  IanaTimeZone,
  Instant,
  LocalDate,
  QuestDefinition,
  QuestMetric,
  Uuid,
  XpEvent,
} from "@momentum/core/types";
import type { LevelProgress, QuestFacts, QuestProgress } from "@momentum/core/gamification";

/**
 * The shapes the progress surface renders. Every one of them is server-computed
 * and read-only: nothing on this page sends an amount, and the numbers below
 * are reports of a ledger rather than inputs to one (Domain Rule 6).
 */

/** The compact indicator the top bar shows on every authenticated route. */
export interface ProgressBadge extends LevelProgress {
  coins: number;
  /** The equipped profile frame, if the user owns and wears one. */
  frame: string | null;
  /** Unlocked achievements, newest first — the celebration compares against this. */
  unlocked: readonly UnlockedAchievement[];
  /** Weekly goals claimed this week, so a completion can be celebrated once. */
  weeklyGoalsClaimed: number;
}

export interface UnlockedAchievement {
  key: string;
  name: string;
  unlockedAt: Instant;
}

export interface QuestRow {
  assignmentId: Uuid;
  definition: QuestDefinition;
  progress: QuestProgress;
  completedAt: Instant | null;
  /** Met, not yet claimed — the only state the Claim control is offered in. */
  claimable: boolean;
}

export interface AchievementRow {
  definition: AchievementDefinition;
  unlockedAt: Instant | null;
}

export interface CosmeticRow {
  definition: CosmeticDefinition;
  owned: boolean;
  equipped: boolean;
  affordable: boolean;
}

export interface WeeklyGoalRow {
  id: Uuid;
  metric: QuestMetric;
  target: number;
  title: string | null;
  progress: QuestProgress;
  completedAt: Instant | null;
  claimable: boolean;
}

export interface ProgressPageData {
  timezone: IanaTimeZone;
  today: LocalDate;
  weekStart: LocalDate;
  badge: ProgressBadge;
  /** Today's facts and the week's, counted once from the same rows. */
  todayFacts: QuestFacts;
  weekFacts: QuestFacts;
  daily: readonly QuestRow[];
  weekly: readonly QuestRow[];
  goals: readonly WeeklyGoalRow[];
  achievements: readonly AchievementRow[];
  cosmetics: readonly CosmeticRow[];
  recent: readonly XpEvent[];
  /** What the day's caps have already paid out, so the page can state the rule. */
  cappedToday: readonly { source: string; awarded: number; cap: number }[];
}
