import { configDefaults, defineConfig } from "vitest/config";

/** The domain suite again under a non-UTC process timezone, so host-clock dependence fails. */
export default defineConfig({
  test: {
    name: "core:tz",
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "**/._*"],
    env: { TZ: "America/Los_Angeles" },
  },
});
