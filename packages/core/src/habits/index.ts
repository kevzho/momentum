/**
 * `@momentum/core/habits` — targets, progress, consistency and the "Add to
 * week" block plan, framework-free.
 *
 * Habits do not use the recurrence model (docs/ARCHITECTURE.md §11): a habit's
 * schedule is `activeDays` plus a target, and "Add to week" writes real
 * `calendar_blocks` rows for one week. There is no second expansion strategy
 * here and there must not be one.
 *
 * Everything is pure and takes "today", the week start and the habit's own
 * start date as parameters, so the server render, the optimistic client
 * overlay and the tests all get the same answers without consulting a clock
 * (Domain Rules 4, 5). And every rate in it obeys Domain Rule 7: a missed day
 * lowers a percentage and removes nothing.
 */
export * from "./model";
export * from "./progress";
export * from "./consistency";
export * from "./plan";
