import type { Minutes } from "../types/scalars";
import type { TaskPriority } from "../types/task";

/**
 * The focus XP rule, written down once.
 *
 * **This module is a specification, not the implementation.** XP is computed by
 * `finish_focus_session()` in SQL, inside a transaction, from timestamps the
 * database stamped itself — that is Domain Rule 6, and nothing on this side of
 * the wire is allowed to assert an amount. What lives here is the same rule in
 * a form that can be exhaustively tested without a database, and the tunables
 * the *interface* legitimately needs to state (a screen that offers a 3-minute
 * session should say up front that it will not earn, rather than letting the
 * user find out afterwards).
 *
 * The obvious objection is that two copies of a rule drift, which is what
 * `CLAUDE.md` forbids. So they are pinned to each other:
 * `packages/db/src/focus-rules.test.ts` reads the migration as text, extracts
 * the numbers `xp_rule()` returns, and fails if any of them disagrees with
 * `FOCUS_XP` below. Changing a tunable is a migration *and* a one-line change
 * here, or the suite goes red.
 *
 * The anti-farming shape is the point (`specs/07-focus-mode.md`):
 * repeatedly starting and abandoning trivial sessions must not be profitable.
 * A session under the minimum earns nothing at all, one session cannot earn
 * more than `sessionCap`, and a day cannot earn more than `dailyCap` however
 * many sessions it contains. Time is still recorded in every one of those
 * cases — the cap limits the reward, never the measurement (Domain Rule 3),
 * and nothing is ever taken away (Domain Rule 7).
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
 * The award for one finished session.
 *
 * The order is deliberate and is the order the SQL applies:
 *
 * 1. Under the minimum earns nothing — before anything else, so no bonus can
 *    rescue a 90-second session.
 * 2. A point a focused minute.
 * 3. `+10%` for reaching the planned length. "Reaching" is `actual >= planned`,
 *    so a session run past its bell still counts as completed rather than
 *    losing the bonus for overrunning.
 * 4. A small flat bonus when the session is attributed to a P1 task.
 * 5. The session cap, then what is left of the day's cap. Bonuses are inside
 *    the caps, not added after them, or the cap would not be a cap.
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
