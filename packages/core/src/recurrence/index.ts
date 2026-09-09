/**
 * `@momentum/core/recurrence` — the rule on a series row plus a window in, the
 * occurrences that belong on the grid out (docs/ARCHITECTURE.md §11).
 *
 * Pure and clock-free. `schedule.ts` is deliberately not re-exported: which
 * dates a rule selects is an implementation detail of the expansion, and
 * exposing it would invite a caller to build occurrences without the override
 * and window rules that `expandSeries` applies to them.
 */
export * from "./expand";
