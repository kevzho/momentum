import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "db",
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // macOS AppleDouble sidecars (`._name.test.ts`) match the include glob.
    exclude: [...configDefaults.exclude, "**/._*"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Every integration file signs in as the same seeded account and asserts on
    // its totals and daily caps; parallel files race each other.
    fileParallelism: false,
  },
});
