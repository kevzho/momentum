// The one place an unexpected error is reported, so a real error service is a change in one file.
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production") return;
  console.error("[momentum]", error, context ?? {});
}
