import { addMinutes } from "../time";
import type { Instant, Minutes } from "../types/scalars";
import type { TaskPriority } from "../types/task";
import type { XpSourceType } from "../types/gamification";

/**
 * What work is worth, written where it can be tested without a database.
 *
 * The same standing as `FOCUS_XP` in `@momentum/core/focus`, and for the same
 * reasons. **The amounts here are never sent anywhere.** Every award is
 * computed in SQL, in the transaction that caused it, from rows the database
 * wrote itself (Domain Rule 6); the client sends an id and reads a ledger. What
 * this module is for is the interface being able to say what completing a task
 * is worth *before* it is completed, and the rule being exhaustively testable.
 *
 * The two copies are pinned together by
 * `packages/db/src/gamification-rules.test.ts`, which reads
 * `20260907140000_gamification_functions.sql` as text and compares every number
 * `xp_rule()` returns with its constant here. Changing a tunable is a migration
 * *and* a one-line change in this file, or the suite goes red.
 */
export const TASK_XP = {
  /** `task_base` — "~10 base XP" (specs/08-gamification.md). */
  base: 10,
  /** `priority_bonus_p1` — shared with focus; a P1 task is the one that mattered. */
  priorityBonusP1: 5,
  /** `task_significant_minutes` — the estimate at which a project task counts as significant. */
  significantMinutes: 120,
  /** `task_significant_bonus` — the additional reward for finishing one. */
  significantBonus: 10,
} as const;

/**
 * Per-day ceilings on what one source can mint, applied by a trigger on the
 * ledger itself so no awarding function can forget one (Domain Rule 6).
 *
 * They bound *reward*, never measurement and never anything already earned
 * (Domain Rules 3, 7): the task is still completed, the minutes are still
 * recorded, and nothing is taken back. The numbers sit well above a committed
 * day and well below what a script could mint in a loop — twenty tasks, or ten
 * habits at their maximum reward.
 *
 * Sources absent from this table are uncapped because their definitions already
 * bound them: three daily and two weekly quest assignments, one weekly goal per
 * metric per week, and an achievement that unlocks once ever.
 */
export const XP_DAILY_CAPS: Partial<Record<XpSourceType, number>> = {
  /** `task_daily_cap`. */
  task: 200,
  /** `habit_daily_cap`. */
  habit_completion: 100,
  /** `focus_daily_cap`, deferred to the focus tunable so the two cannot disagree. */
  focus_session: 300,
};

/**
 * The window a cap is measured over: the last 24 hours, rolling.
 *
 * Not the local calendar day. `cap_xp_event` sums `created_at > now() -
 * interval '24 hours'` (Domain Rules §21) because a window resolved in a
 * timezone the client can write was a window the client could reset. Any
 * surface that *reports* how much of a cap is used has to measure the same
 * window, or it says "0 of 200" at 00:10 while the ledger still counts the
 * 200 XP earned at 23:30 — so the window is defined here, once, and the
 * page asks for it rather than deriving a day.
 */
export const XP_CAP_WINDOW_MINUTES: Minutes = 24 * 60;

export function xpCapWindow(now: Instant): { start: Instant; end: Instant } {
  return { start: addMinutes(now, -XP_CAP_WINDOW_MINUTES), end: now };
}

/** Flat rewards decided by this phase rather than by a definition row. */
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
  /** The user's own estimate (Domain Rule 3), or null when they gave none. */
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
 * What completing one task is worth.
 *
 * A base, a small bonus for a P1, and a bonus for finishing a *significant
 * project task* — one that belongs to a project and that the user estimated at
 * two hours or more. Reading the estimate rather than the measured time is
 * deliberate: the reward is for finishing the thing the user called big, not
 * for having taken a long time over it, and Domain Rule 3 keeps those two
 * numbers apart for exactly that kind of reason.
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
