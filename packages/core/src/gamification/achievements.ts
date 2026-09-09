import type { CosmeticKind } from "../types/gamification";

/**
 * The six starter achievements, and the numbers their conditions check.
 *
 * The conditions themselves are evaluated in SQL (`achievement_earned()`), over
 * the caller's own rows, because an achievement is a fact about work that
 * happened and nothing the client says can make one true. What lives here is
 * the vocabulary — a key union the interface can switch on — and the thresholds
 * the copy quotes, so the number a user is told and the number the database
 * checks are the same number.
 */
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
  /**
   * `consistency_weeks` — weeks in which a habit reached its target.
   *
   * Counted, not chained: they do not have to be consecutive, and a week that
   * went badly subtracts nothing (Domain Rule 7). This is an achievement, not a
   * streak the user can be made to fear losing.
   */
  consistencyWeeks: 5,
  /** `early_bird_blocks` — completed blocks that started before the hour below. */
  earlyBirdBlocks: 10,
  /** `early_bird_before_hour` — noon, in the user's own timezone (Domain Rule 4). */
  earlyBirdBeforeHour: 12,
  /** `planner_tasks` — distinct tasks with a block booked ahead of the time it reserves. */
  plannerTasks: 5,
} as const;

/**
 * The cosmetics this phase actually renders.
 *
 * Coins buy appearance and nothing else — never functionality, never time,
 * never an advantage (specs/08-gamification.md). specs asks for the
 * architecture plus one minimal first collection, and profile frames are it:
 * the other three kinds keep their definition rows and their `available` flag
 * is false until the phase that draws them arrives, because a shop that took
 * coins for something invisible would be the worst version of this feature.
 */
export const IMPLEMENTED_COSMETIC_KIND: CosmeticKind = "profile_frame";

export const PROFILE_FRAME_KEYS = ["frame_copper", "frame_graphite"] as const;
export type ProfileFrameKey = (typeof PROFILE_FRAME_KEYS)[number];

export function isProfileFrameKey(value: string | null | undefined): value is ProfileFrameKey {
  return typeof value === "string" && (PROFILE_FRAME_KEYS as readonly string[]).includes(value);
}
