/**
 * `@momentum/core/parser` — Quick Add's natural-language parser.
 *
 * Deterministic, framework-free and pure: one string plus the day it was typed
 * on in; a title plus at most four values out. See `quick-add.ts` for the
 * rules it applies and, more importantly, for the ones it refuses to.
 */
export * from "./quick-add";
export { MAX_PARSED_MINUTES } from "./tokens";
