import { defineConfig, devices } from "@playwright/test";

/**
 * Runs against the real application and the local Supabase stack, signed in
 * as the seeded accounts: needs `supabase start` and `pnpm db:reset`. Uses the
 * system Chrome; `pnpm test:e2e` starts `next dev` unless port 3000 is busy.
 */
export default defineConfig({
  testDir: "e2e",
  // macOS AppleDouble sidecars (`._foo.spec.ts`) are metadata, never tests.
  testIgnore: "**/._*",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    channel: "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // `@mobile` specs run only at phone size, everything else only on desktop.
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
      grepInvert: /@mobile/,
    },
    {
      name: "mobile",
      // iPhone 13 emulation in the system Chrome; the preset's own browser is WebKit.
      use: { ...devices["iPhone 13"], channel: "chrome", defaultBrowserType: "chromium" },
      grep: /@mobile/,
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
