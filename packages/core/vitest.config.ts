import { configDefaults, defineConfig } from "vitest/config";

/**
 * The domain suite under UTC. It also runs under a second, non-UTC process
 * timezone — see `vitest.config.tz.ts`, which is registered as its own project
 * by the root runner.
 */
export default defineConfig({
  test: {
    name: "core",
    environment: "node",
    include: ["src/**/*.test.ts"],
    // macOS AppleDouble sidecars (`._name.test.ts`) match the include glob on
    // non-HFS volumes and are not JavaScript. See .gitignore.
    exclude: [...configDefaults.exclude, "**/._*"],
    env: { TZ: "UTC" },
  },
});
