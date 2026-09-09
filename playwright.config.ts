import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests for the 18 audit workflows (docs/ARCHITECTURE.md §13).
 *
 * They run against the real application and the local Supabase stack, signed
 * in as the seeded accounts, so they need `supabase start` and a seeded
 * database (`pnpm db:reset`). The system Chrome is used (`channel: "chrome"`)
 * so no browser download is needed; `pnpm test:e2e` starts `next dev` when
 * nothing is listening on port 3000 and reuses it otherwise.
 */
export default defineConfig({
  testDir: "e2e",
  // macOS AppleDouble sidecars (`._foo.spec.ts`) are metadata, never tests —
  // the same exclusion `.gitignore` and `eslint.config.mjs` carry.
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
    // The two projects partition the suite: `@mobile` specs run only at phone
    // size, and everything else only on the desktop viewport.
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
      grepInvert: /@mobile/,
    },
    {
      name: "mobile",
      // iPhone 13 emulation (390×664, touch, mobile UA) in the system Chrome;
      // the device preset's own browser is WebKit, which is not installed.
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
