import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "db",
    environment: "node",
    // Mappers live next to the code they map; the integration suite talks to a
    // real Postgres and lives apart from it. Both run in this project, but the
    // integration tests skip themselves unless MOMENTUM_DB_TESTS is set, so
    // `pnpm test` stays green without Docker (docs/ARCHITECTURE.md §13).
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // macOS AppleDouble sidecars (`._name.test.ts`) match the include glob on
    // non-HFS volumes and are not JavaScript. See .gitignore.
    exclude: [...configDefaults.exclude, "**/._*"],
    // A cold `supabase start` plus a full reset is slower than a unit test.
    testTimeout: 30_000,
    hookTimeout: 120_000,
    /*
     * One file at a time. Every integration test in this project signs in as the
     * *same* seeded account and asserts on that account's rows — its ledger
     * total, its level, its daily XP caps. Running the files in parallel makes
     * those assertions race each other: one file completing a task moves a
     * total another file just read, and a per-day cap is a property of the
     * account rather than of the file that filled it. This is not a slow-test
     * concession; a shared fixture with shared mutable state is not safe to run
     * concurrently, and the suite was only ever green because it had never run.
     */
    fileParallelism: false,
  },
});
