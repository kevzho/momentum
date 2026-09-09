import type { CosmeticKind } from "../types/gamification";

/** Conditions are evaluated in SQL (`achievement_earned()`); only the keys and the thresholds the copy quotes live here. */
export const ACHIEVEMENT_KEYS = [
  "first_step",
  "deep_work",
  "consistency",
  "early_bird",
  "planner",
  "project_finisher",
] as const;
export type AchievementKey = (typeof ACHIEVEMENT_KEYS)[number];

export function isAchievementKey(value: string): value is AchievementKey {
  return (ACHIEVEMENT_KEYS as readonly string[]).includes(value);
}

export const ACHIEVEMENT_RULES = {
  /** `deep_work_minutes` — the length that counts as deep work. */
  deepWorkMinutes: 90,
  /** `consistency_weeks` — weeks in which a habit reached its target. Counted, not consecutive (Domain Rule 7). */
  consistencyWeeks: 5,
  /** `early_bird_blocks` — completed blocks that started before the hour below. */
  earlyBirdBlocks: 10,
  /** `early_bird_before_hour` — noon, in the user's timezone. */
  earlyBirdBeforeHour: 12,
  /** `planner_tasks` — distinct tasks with a block booked ahead of the time it reserves. */
  plannerTasks: 5,
} as const;

/** The only cosmetic kind the product renders; other kinds stay `available: false` until drawn. */
export const IMPLEMENTED_COSMETIC_KIND: CosmeticKind = "profile_frame";

export const PROFILE_FRAME_KEYS = ["frame_copper", "frame_graphite"] as const;
export type ProfileFrameKey = (typeof PROFILE_FRAME_KEYS)[number];

export function isProfileFrameKey(value: string | null | undefined): value is ProfileFrameKey {
  return typeof value === "string" && (PROFILE_FRAME_KEYS as readonly string[]).includes(value);
}
