import type { Minutes } from "../types/scalars";
import type { TaskPriority } from "../types/task";

/**
 * A display-side mirror of `finish_focus_session()` in SQL, which is what
 * actually awards XP (Domain Rule 6). Every number must match `xp_rule()` in
 * the migration; `packages/db/src/focus-rules.test.ts` fails if they drift.
 * Caps limit the reward, never the recorded time.
 */
export const FOCUS_XP = {
  /** `focus_per_minute` — roughly a point a focused minute. */
  perMinute: 1,
  /** `focus_min_session_minutes` — below this a session earns nothing. */
  minSessionMinutes: 5,
  /** `focus_session_cap` — the most one session can earn. */
  sessionCap: 120,
  /** `focus_daily_cap` — the most focus XP one local day can earn. */
  dailyCap: 300,
  /** `focus_planned_bonus_pct` — for reaching the length you planned. */
  plannedBonusPct: 10,
  /** `priority_bonus_p1` — a small bonus for a session on a P1 task. */
  priorityBonusP1: 5,
} as const;

export interface FocusXpInput {
  /** Measured minutes, excluding pauses. Never the estimate (Domain Rule 3). */
  actualMinutes: Minutes;
  plannedMinutes: Minutes;
  /** The linked task's priority, or null when the session is not linked to one. */
  taskPriority: TaskPriority | null;
  /** Focus XP already awarded in the user's local day, from the ledger. */
  focusXpAwardedToday: number;
}

/** Why an award is the number it is — the ledger stores only the amount. */
export type FocusXpLimit = "none" | "minimum" | "session_cap" | "daily_cap";

export interface FocusXpAward {
  amount: number;
  base: number;
  plannedBonus: number;
  priorityBonus: number;
  /** Before either cap is applied. */
  earned: number;
  limitedBy: FocusXpLimit;
}

/**
 * The award for one finished session, in the order the SQL applies: minimum
 * check, base, planned bonus (`actual >= planned`), P1 bonus, session cap,
 * then the day's remaining cap. Bonuses are inside the caps.
 */
export function focusXpAward(input: FocusXpInput): FocusXpAward {
  const minutes = Math.max(0, Math.floor(input.actualMinutes));

  if (minutes < FOCUS_XP.minSessionMinutes) {
    return {
      amount: 0,
      base: 0,
      plannedBonus: 0,
      priorityBonus: 0,
      earned: 0,
      limitedBy: "minimum",
    };
  }

  const base = minutes * FOCUS_XP.perMinute;
  const plannedBonus =
    input.plannedMinutes > 0 && minutes >= input.plannedMinutes
      ? Math.floor((base * FOCUS_XP.plannedBonusPct) / 100)
      : 0;
  const priorityBonus = input.taskPriority === 1 ? FOCUS_XP.priorityBonusP1 : 0;

  const earned = base + plannedBonus + priorityBonus;
  const afterSession = Math.min(earned, FOCUS_XP.sessionCap);
  const dayRemaining = Math.max(0, FOCUS_XP.dailyCap - Math.max(0, input.focusXpAwardedToday));
  const amount = Math.min(afterSession, dayRemaining);

  return {
    amount,
    base,
    plannedBonus,
    priorityBonus,
    earned,
    limitedBy: amount < afterSession ? "daily_cap" : afterSession < earned ? "session_cap" : "none",
  };
}
