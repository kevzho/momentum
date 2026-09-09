import { configDefaults, defineConfig } from "vitest/config";

/** The domain suite under UTC; `vitest.config.tz.ts` runs it again under a non-UTC zone. */
export default defineConfig({
  test: {
    name: "core",
    environment: "node",
    include: ["src/**/*.test.ts"],
    // macOS AppleDouble sidecars (`._name.test.ts`) match the include glob.
    exclude: [...configDefaults.exclude, "**/._*"],
    env: { TZ: "UTC" },
  },
});
