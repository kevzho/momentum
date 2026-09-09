/**
 * `@momentum/core/gamification` — the progression rules, framework-free.
 *
 * Everything here is a *mirror* of trusted database logic, never a substitute
 * for it. XP is computed by `security definer` functions from rows the database
 * stamped itself, and the client never asserts an amount (Domain Rule 6). What
 * this module exists for is the interface: showing how far through a level a
 * total is, what a quest is asking for, and what finishing a task will be
 * worth — without a round trip, and where the rules can be tested exhaustively
 * without Docker.
 *
 * The duplication is deliberate and pinned: `packages/db/src/
 * gamification-rules.test.ts` reads the migration as text and fails if any
 * number here disagrees with the one `xp_rule()` returns.
 */
export * from "./levels";
export * from "./xp";
export * from "./quests";
export * from "./achievements";
