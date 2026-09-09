import { describe, expect, it } from "vitest";

import {
  DOCUMENTED_LEVELS,
  LEVEL_CURVE,
  LEVEL_THRESHOLDS,
  levelForXp,
  levelProgress,
  xpForLevel,
} from "./levels";

/**
 * The curve, and the two properties that make it usable: it never goes
 * backwards, and `levelForXp` is the exact inverse of `xpForLevel` at every
 * boundary. The boundary cases are the ones a user notices — one XP short of a
 * level has to read as the level below it, whatever `Math.pow` returns.
 */

describe("xpForLevel", () => {
  it("costs nothing to be level 1", () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(0)).toBe(0);
    expect(xpForLevel(-4)).toBe(0);
  });

  it("matches the documented thresholds", () => {
    // The first six, spelled out, so a change to the formula has to be a
    // deliberate change to these numbers as well.
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(282);
    expect(xpForLevel(4)).toBe(519);
    expect(xpForLevel(5)).toBe(800);
    expect(xpForLevel(10)).toBe(2700);
    expect(xpForLevel(20)).toBe(8281);
  });

  it("is strictly increasing", () => {
    for (let level = 2; level <= 200; level += 1) {
      expect(xpForLevel(level)).toBeGreaterThan(xpForLevel(level - 1));
    }
  });

  it("keeps levelling reachable rather than exponential", () => {
    // The pacing specs/08-gamification.md asks for: a level 40 user still
    // levels up sometimes. One level at 40 costs under a thousand XP — a few
    // committed days, not a month.
    const costAt40 = xpForLevel(41) - xpForLevel(40);
    expect(costAt40).toBeLessThan(1_000);

    // And the early ones are quick: 1 to 5 costs less than a single level at 40.
    expect(xpForLevel(5)).toBeLessThan(costAt40);
  });
});

describe("levelForXp", () => {
  it("starts at 1 and never goes below it", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(-500)).toBe(1);
    expect(levelForXp(99)).toBe(1);
  });

  it("inverts xpForLevel exactly at every boundary", () => {
    for (let level = 1; level <= DOCUMENTED_LEVELS + 20; level += 1) {
      const threshold = xpForLevel(level);
      expect(levelForXp(threshold)).toBe(level);
      if (level > 1) {
        // One short is still the level below. This is the case floating point
        // gets wrong if nothing corrects it.
        expect(levelForXp(threshold - 1)).toBe(level - 1);
      }
    }
  });

  it("never decreases as XP grows", () => {
    let previous = 1;
    for (let xp = 0; xp <= 30_000; xp += 37) {
      const level = levelForXp(xp);
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
  });
});

describe("levelProgress", () => {
  it("reports the level, the position in it, and what it costs", () => {
    const progress = levelProgress(900);
    expect(progress.level).toBe(5);
    expect(progress.xpTotal).toBe(900);
    expect(progress.xpIntoLevel).toBe(100);
    expect(progress.xpForNextLevel).toBe(xpForLevel(6) - xpForLevel(5));
    expect(progress.xpRemaining).toBe(xpForLevel(6) - 900);
  });

  it("is empty but valid at zero", () => {
    const progress = levelProgress(0);
    expect(progress).toMatchObject({ level: 1, xpIntoLevel: 0, fraction: 0 });
    expect(progress.xpForNextLevel).toBe(100);
  });

  it("clamps the fraction into 0..1 and tolerates nonsense", () => {
    for (const xp of [0, 1, 99, 100, 2_699, 2_700, 500_000]) {
      const { fraction } = levelProgress(xp);
      expect(fraction).toBeGreaterThanOrEqual(0);
      expect(fraction).toBeLessThanOrEqual(1);
    }
    expect(levelProgress(Number.NaN).level).toBe(1);
    expect(levelProgress(-10).xpTotal).toBe(0);
  });

  it("lands exactly on a boundary without overflowing into the next level", () => {
    const progress = levelProgress(xpForLevel(12));
    expect(progress.level).toBe(12);
    expect(progress.xpIntoLevel).toBe(0);
  });
});

describe("the documented table", () => {
  it("has one entry per documented level, derived from the curve", () => {
    expect(LEVEL_THRESHOLDS).toHaveLength(DOCUMENTED_LEVELS);
    LEVEL_THRESHOLDS.forEach((threshold, index) => {
      expect(threshold).toBe(xpForLevel(index + 1));
    });
  });

  it("states the curve's own constants", () => {
    expect(LEVEL_CURVE).toEqual({ base: 100, exponentPct: 150 });
  });
});
