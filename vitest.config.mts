import { defineConfig } from "vitest/config";

// `packages/core` is registered twice on purpose: once under UTC and once under
// America/Los_Angeles, so a function that reads the process timezone fails.
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
