/**
 * `@momentum/core/analytics` — the aggregation layer behind `/analytics`
 * (Phase 10) and the weekly review (Phase 14).
 *
 * Framework-free and clock-free, like the rest of `@momentum/core`: every
 * function takes the period, the timezone and the rows as parameters and reads
 * no ambient default. That is what lets one database read produce three time
 * windows, and what lets the tests pin a DST weekend without touching `TZ`.
 *
 * Two rules govern everything here and are worth stating at the door:
 *
 * - **Bucketing is the user's, not the server's.** Day, week and hour all
 *   resolve through `@momentum/core/time` in the profile timezone
 *   (Domain Rule 4). `buckets.ts` is the only file that decides this.
 * - **Insights report correlation, never causation, and never characterise the
 *   user** (Domain Rule 8). Every one is gated on a declared minimum sample
 *   size and suppressed below it. See `insights.ts`.
 */
export * from "./period";
export * from "./buckets";
export * from "./facts";
export * from "./focus";
export * from "./tasks";
export * from "./estimates";
export * from "./habits";
export * from "./blocks";
export * from "./insights";
export * from "./summary";
