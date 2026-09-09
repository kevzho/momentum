import { addMinutes } from "../time";
import type { Instant, Minutes } from "../types/scalars";
import type { TaskPriority } from "../types/task";
import type { XpSourceType } from "../types/gamification";

/**
 * A display-side mirror of the SQL award rules; the amounts here are never
 * sent anywhere (Domain Rule 6). Every number must match `xp_rule()` in the
 * gamification functions migration; `packages/db/src/gamification-rules.test.ts`
 * fails if they drift.
 */
export const TASK_XP = {
  /** `task_base`. */
  base: 10,
  /** `priority_bonus_p1` — shared with focus. */
  priorityBonusP1: 5,
  /** `task_significant_minutes` — the estimate at which a project task counts as significant. */
  significantMinutes: 120,
  /** `task_significant_bonus` — the additional reward for finishing one. */
  significantBonus: 10,
} as const;

/**
 * Per-day ceilings on what one source can mint, applied by a trigger on the
 * ledger. Sources absent here are already bounded by their definitions.
 */
export const XP_DAILY_CAPS: Partial<Record<XpSourceType, number>> = {
  /** `task_daily_cap`. */
  task: 200,
  /** `habit_daily_cap`. */
  habit_completion: 100,
  /** `focus_daily_cap`; must equal `FOCUS_XP.dailyCap`. */
  focus_session: 300,
};

/**
 * A cap is measured over the last 24 hours, rolling, not the local calendar
 * day: `cap_xp_event` sums `created_at > now() - interval '24 hours'` because a
 * window resolved in a client-writable timezone could be reset by the client.
 */
export const XP_CAP_WINDOW_MINUTES: Minutes = 24 * 60;

export function xpCapWindow(now: Instant): { start: Instant; end: Instant } {
  return { start: addMinutes(now, -XP_CAP_WINDOW_MINUTES), end: now };
}

/** Flat rewards not carried by a definition row. */
export const REWARD_XP = {
  /** `weekly_goal_base` — flat, so a bigger number in the target field pays nothing extra. */
  weeklyGoal: 50,
  /** `weekly_goal_coins`. */
  weeklyGoalCoins: 20,
  /** `achievement_base`. */
  achievement: 40,
} as const;

export interface TaskXpInput {
  priority: TaskPriority;
  /** A task outside a project is never "a significant project task". */
  projectId: string | null;
  /** The user's own estimate, or null when they gave none. */
  estimatedMinutes: Minutes | null;
  /** Task XP already awarded in the user's local day, from the ledger. */
  taskXpAwardedToday: number;
}

export interface TaskXpAward {
  amount: number;
  base: number;
  priorityBonus: number;
  significantBonus: number;
  /** Before the daily cap is applied. */
  earned: number;
  limitedBy: "none" | "daily_cap";
}

/**
 * What completing one task is worth. The significant-task bonus reads the
 * estimate, not the measured time: the reward is for finishing what the user
 * called big, not for taking long over it.
 */
export function taskXpAward(input: TaskXpInput): TaskXpAward {
  const base = TASK_XP.base;
  const priorityBonus = input.priority === 1 ? TASK_XP.priorityBonusP1 : 0;
  const significantBonus =
    input.projectId !== null && (input.estimatedMinutes ?? 0) >= TASK_XP.significantMinutes
      ? TASK_XP.significantBonus
      : 0;

  const earned = base + priorityBonus + significantBonus;
  const cap = XP_DAILY_CAPS.task ?? Number.POSITIVE_INFINITY;
  const remaining = Math.max(0, cap - Math.max(0, input.taskXpAwardedToday));
  const amount = Math.min(earned, remaining);

  return {
    amount,
    base,
    priorityBonus,
    significantBonus,
    earned,
    limitedBy: amount < earned ? "daily_cap" : "none",
  };
}
