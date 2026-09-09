/**
 * The one place an unexpected error is reported.
 *
 * Error boundaries and failed actions call this instead of `console.error`
 * directly, so wiring a real error service later is a change in one file and
 * not a dependency now (docs/ARCHITECTURE.md §15).
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production") return;
  console.error("[momentum]", error, context ?? {});
}
