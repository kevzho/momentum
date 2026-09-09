/**
 * A display-side mirror of the trusted database XP logic, never a substitute
 * for it. The numbers here must match `xp_rule()` in the migration;
 * `packages/db/src/gamification-rules.test.ts` fails if they drift.
 */
export * from "./levels";
export * from "./xp";
export * from "./quests";
export * from "./achievements";
