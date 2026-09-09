import { configDefaults, defineConfig } from "vitest/config";

/**
 * The same domain suite, under a process timezone that is not UTC.
 *
 * Every function in `@momentum/core/time` takes its timezone explicitly and
 * none reads an ambient default (docs/ARCHITECTURE.md §10). The cheapest proof
 * that this stays true is to run the whole suite again with `TZ` set to
 * somewhere else: any accidental dependence on the host's clock — a bare
 * `new Date(y, m, d)`, a `getHours()`, a `toISOString()` on a local-constructed
 * date — gives a different answer here and fails.
 */
export default defineConfig({
  test: {
    name: "core:tz",
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "**/._*"],
    env: { TZ: "America/Los_Angeles" },
  },
});
