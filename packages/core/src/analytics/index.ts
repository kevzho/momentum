/**
 * Aggregations behind `/analytics` and the weekly review. Bucketing resolves
 * in the profile timezone (`buckets.ts` alone decides this); insights report
 * correlation, never causation, and are suppressed below a minimum sample.
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
