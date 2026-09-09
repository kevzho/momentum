/**
 * `@momentum/core/time` — the one module that owns date and time logic
 * (Domain Rule 5). Nothing outside it may do date arithmetic, and everything
 * inside it takes its timezone and its clock as parameters.
 *
 * `epoch.ts` is intentionally absent: converting an `Instant` to a raw
 * millisecond number is how ad-hoc date maths gets back into components, so
 * that door stays inside the module.
 */
export * from "./scalars";
export * from "./clock";
export * from "./calendar-date";
export * from "./zone";
export * from "./duration";
export * from "./format";
export * from "./wall-clock";
