/**
 * `@momentum/core/focus` — the focus session's domain logic.
 *
 * Three concerns, all pure and all framework-free:
 *
 *   `presets`  the session lengths, and the bounds a custom one has to sit in
 *   `timer`    elapsed, paused and remaining time, derived from timestamps
 *   `xp`       the award rule, as a specification pinned to the SQL that runs it
 *   `history`  today, this week and per-project totals
 *
 * Nothing here reads a clock or a timezone of its own: `now`, `today` and the
 * profile timezone are arguments (docs/ARCHITECTURE.md §10).
 */
export * from "./presets";
export * from "./timer";
export * from "./xp";
export * from "./history";
