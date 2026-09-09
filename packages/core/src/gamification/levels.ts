/**
 * The level curve.
 *
 * ```
 * cumulative XP to reach level L = floor(base * (L - 1) ^ exponent)
 *                                = floor(100  * (L - 1) ^ 1.5)
 * ```
 *
 * **Why this shape.** The pacing specs/08-gamification.md asks for is "1–5
 * quick, 5–20 moderate, 20+ progressively harder — not exponentially absurd; a
 * level 40 user should still level up sometimes." An exponential curve fails
 * the last clause by construction: whatever base you pick, the cost per level
 * eventually outruns any amount of real work, and the progression quietly stops
 * meaning anything. A `L ^ 1.5` curve grows the *per-level* cost with the
 * square root of the level instead — 100 XP for level 2, about 300 for level
 * 10, about 940 for level 40 — so a committed user keeps arriving somewhere
 * without the early levels being trivial.
 *
 * `docs/ARCHITECTURE.md` §16 carries the reasoning and the first thirty
 * thresholds.
 *
 * **This module is a mirror, not the source.** `level_for_xp()` and
 * `xp_for_level()` in `20260907140000_gamification_functions.sql` compute the
 * level that is stored on the profile; nothing here is ever written back
 * (Domain Rule 6). What lives here is the same curve, where the interface can
 * ask "how far into this level am I" without a round trip, and where it can be
 * tested exhaustively. `packages/db/src/gamification-rules.test.ts` reads the
 * migration as text and fails if the two disagree.
 */

export const LEVEL_CURVE = {
  /** `level_curve_base` — the XP cost of the first level. */
  base: 100,
  /** `level_curve_exponent_pct` — 150 means the exponent 1.5. */
  exponentPct: 150,
} as const;

/** The first level. Levels start at 1, and 1 costs nothing. */
export const FIRST_LEVEL = 1;

/** Cumulative XP required to reach a level. `xpForLevel(1)` is 0. */
export function xpForLevel(level: number): number {
  if (!Number.isFinite(level) || level <= FIRST_LEVEL) return 0;
  return Math.floor(LEVEL_CURVE.base * Math.pow(level - 1, LEVEL_CURVE.exponentPct / 100));
}

/**
 * The level a total buys.
 *
 * The analytic inverse, then corrected against the thresholds themselves —
 * floating point must never decide a level. A user one XP short of level 12 has
 * to be shown level 11, however `Math.pow` rounds.
 */
export function levelForXp(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return FIRST_LEVEL;

  let level = Math.max(
    FIRST_LEVEL,
    Math.floor(Math.pow(xp / LEVEL_CURVE.base, 100 / LEVEL_CURVE.exponentPct)) + 1,
  );

  while (level > FIRST_LEVEL && xp < xpForLevel(level)) level -= 1;
  while (xp >= xpForLevel(level + 1)) level += 1;

  return level;
}

/** What the top bar shows: a level, and how far through it the total is. */
export interface LevelProgress {
  level: number;
  /** The account's whole XP total, straight from the profile. */
  xpTotal: number;
  /** XP earned since reaching this level. */
  xpIntoLevel: number;
  /** XP this level costs in total — the denominator, never a running remainder. */
  xpForNextLevel: number;
  /** 0..1, clamped. */
  fraction: number;
  /** XP still to earn before the next level. */
  xpRemaining: number;
}

export function levelProgress(xp: number): LevelProgress {
  const total = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  const level = levelForXp(total);
  const floor = xpForLevel(level);
  const ceiling = xpForLevel(level + 1);
  const span = Math.max(1, ceiling - floor);
  const into = Math.max(0, total - floor);

  return {
    level,
    xpTotal: total,
    xpIntoLevel: into,
    xpForNextLevel: span,
    fraction: Math.min(1, into / span),
    xpRemaining: Math.max(0, ceiling - total),
  };
}

/** How many thresholds the documentation and the tests tabulate. */
export const DOCUMENTED_LEVELS = 30;

/**
 * `LEVEL_THRESHOLDS[n]` is the XP needed to reach level `n + 1`, for the first
 * `DOCUMENTED_LEVELS` levels. Derived from `xpForLevel` rather than written
 * out, so the table in `docs/ARCHITECTURE.md` and the curve cannot disagree.
 */
export const LEVEL_THRESHOLDS: readonly number[] = Array.from(
  { length: DOCUMENTED_LEVELS },
  (_, index) => xpForLevel(index + 1),
);
