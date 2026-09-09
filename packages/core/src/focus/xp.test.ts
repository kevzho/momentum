import { describe, expect, it } from "vitest";

import { FOCUS_XP, focusXpAward } from "./xp";

/**
 * The anti-farming rules, exhaustively.
 *
 * `finish_focus_session()` is where these run for real; this suite pins the
 * rule itself, and `packages/db/src/focus-rules.test.ts` pins the SQL to the
 * same numbers, so a change to one without the other cannot ship.
 *
 * The property the whole set adds up to is the one the spec states: repeatedly
 * starting and abandoning trivial sessions must not be profitable.
 */

function award(over: Partial<Parameters<typeof focusXpAward>[0]> = {}) {
  return focusXpAward({
    actualMinutes: 25,
    plannedMinutes: 25,
    taskPriority: null,
    focusXpAwardedToday: 0,
    ...over,
  });
}

describe("focusXpAward — the base rule", () => {
  it("is roughly a point a focused minute", () => {
    expect(award({ actualMinutes: 20, plannedMinutes: 25 }).amount).toBe(20);
  });

  it("counts measured minutes, never the planned ones", () => {
    // Planned 90, sat down for 12. The estimate earns nothing (Domain Rule 3).
    expect(award({ actualMinutes: 12, plannedMinutes: 90 }).amount).toBe(12);
  });
});

describe("focusXpAward — sub-minimum sessions earn nothing", () => {
  it("awards zero below the minimum", () => {
    for (let minutes = 0; minutes < FOCUS_XP.minSessionMinutes; minutes += 1) {
      const result = award({ actualMinutes: minutes, plannedMinutes: minutes });
      expect(result.amount).toBe(0);
      expect(result.limitedBy).toBe("minimum");
    }
  });

  it("awards from the minimum upward", () => {
    const result = award({
      actualMinutes: FOCUS_XP.minSessionMinutes,
      plannedMinutes: FOCUS_XP.minSessionMinutes,
    });
    expect(result.amount).toBeGreaterThan(0);
  });

  it("gives a trivial session no bonus to rescue it", () => {
    // Planned two minutes, ran two minutes: "completed", and still nothing.
    const result = award({ actualMinutes: 2, plannedMinutes: 2, taskPriority: 1 });
    expect(result.amount).toBe(0);
    expect(result.plannedBonus).toBe(0);
    expect(result.priorityBonus).toBe(0);
  });

  it("makes farming short sessions worthless however many are run", () => {
    const total = Array.from(
      { length: 40 },
      () => award({ actualMinutes: 4, plannedMinutes: 4 }).amount,
    ).reduce((sum, amount) => sum + amount, 0);

    expect(total).toBe(0);
  });
});

describe("focusXpAward — bonuses", () => {
  it("adds ten per cent for reaching the planned length", () => {
    const result = award({ actualMinutes: 50, plannedMinutes: 50 });

    expect(result.base).toBe(50);
    expect(result.plannedBonus).toBe(5);
    expect(result.amount).toBe(55);
  });

  it("withholds the bonus from a session ended early", () => {
    const result = award({ actualMinutes: 49, plannedMinutes: 50 });

    expect(result.plannedBonus).toBe(0);
    expect(result.amount).toBe(49);
  });

  it("keeps the bonus for a session run past its own bell", () => {
    const result = award({ actualMinutes: 60, plannedMinutes: 50 });

    expect(result.plannedBonus).toBe(6);
    expect(result.amount).toBe(66);
  });

  it("adds a small flat bonus for a session on a P1 task", () => {
    expect(award({ taskPriority: 1 }).priorityBonus).toBe(FOCUS_XP.priorityBonusP1);
    expect(award({ taskPriority: 2 }).priorityBonus).toBe(0);
    expect(award({ taskPriority: 4 }).priorityBonus).toBe(0);
    expect(award({ taskPriority: null }).priorityBonus).toBe(0);
  });
});

describe("focusXpAward — the per-session cap", () => {
  it("caps one session however long it ran", () => {
    const result = award({ actualMinutes: 240, plannedMinutes: 240 });

    expect(result.earned).toBeGreaterThan(FOCUS_XP.sessionCap);
    expect(result.amount).toBe(FOCUS_XP.sessionCap);
    expect(result.limitedBy).toBe("session_cap");
  });

  it("applies the cap after the bonuses, so a bonus cannot exceed it", () => {
    // 115 minutes + 10% + P1 is 131, over the 120 cap.
    const result = award({ actualMinutes: 115, plannedMinutes: 115, taskPriority: 1 });

    expect(result.earned).toBe(131);
    expect(result.amount).toBe(FOCUS_XP.sessionCap);
  });

  it("leaves a session under the cap untouched", () => {
    const result = award({ actualMinutes: 90, plannedMinutes: 90 });

    expect(result.amount).toBe(99);
    expect(result.limitedBy).toBe("none");
  });
});

describe("focusXpAward — the per-day cap", () => {
  it("awards only what is left of the day", () => {
    const result = award({
      actualMinutes: 60,
      plannedMinutes: 60,
      focusXpAwardedToday: FOCUS_XP.dailyCap - 20,
    });

    expect(result.amount).toBe(20);
    expect(result.limitedBy).toBe("daily_cap");
  });

  it("awards nothing once the day's cap is reached", () => {
    const result = award({ focusXpAwardedToday: FOCUS_XP.dailyCap });

    expect(result.amount).toBe(0);
    expect(result.limitedBy).toBe("daily_cap");
  });

  it("never awards a negative amount when the ledger is already over the cap", () => {
    const result = award({ focusXpAwardedToday: FOCUS_XP.dailyCap + 500 });

    expect(result.amount).toBe(0);
  });

  it("bounds a whole day of maximal sessions at the daily cap", () => {
    let awarded = 0;
    for (let session = 0; session < 12; session += 1) {
      awarded += award({
        actualMinutes: 240,
        plannedMinutes: 240,
        taskPriority: 1,
        focusXpAwardedToday: awarded,
      }).amount;
    }

    expect(awarded).toBe(FOCUS_XP.dailyCap);
  });

  it("records the time either way — a cap limits the reward, not the measurement", () => {
    // Nothing in this module touches actual minutes; the assertion is that the
    // award is the only thing the cap returns.
    const result = award({ actualMinutes: 200, focusXpAwardedToday: FOCUS_XP.dailyCap });

    expect(result.amount).toBe(0);
    expect(result.base).toBe(200);
  });
});
