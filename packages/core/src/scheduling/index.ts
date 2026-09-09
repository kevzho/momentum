/**
 * `@momentum/core/scheduling` — capacity, conflict detection and Find Time
 * (specs/05-week-planning.md, docs/SCHEDULING.md).
 *
 * Pure functions over explicit inputs. No clock is read, no network is
 * touched, and no model is consulted anywhere in this module; the same input
 * produces the same output on the server, in the browser and in a test. It
 * depends on `types`, `time` and `calendar` only, in the order
 * docs/ARCHITECTURE.md §2 fixes.
 */
export * from "./types";
export * from "./intervals";
export * from "./capacity";
export * from "./conflicts";
export * from "./find-time";
