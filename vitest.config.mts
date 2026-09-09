import { defineConfig } from "vitest/config";

// One root runner; each workspace package owns its own vitest config
// (environment, setup files). `pnpm test` runs every project in one pass.
//
// `packages/core` is registered twice on purpose: the domain suite runs once
// under UTC and once under America/Los_Angeles, so a function that reads the
// process timezone instead of taking one fails (docs/ARCHITECTURE.md §10).
export default defineConfig({
  test: {
    projects: [
      "packages/*/vitest.config.ts",
      "packages/core/vitest.config.tz.ts",
      "apps/*/vitest.config.mts",
    ],
    passWithNoTests: true,
  },
});
