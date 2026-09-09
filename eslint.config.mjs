import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

/**
 * Single flat config for the whole workspace.
 *
 * Beyond the framework presets, this file enforces the architectural
 * boundaries described in docs/ARCHITECTURE.md. Those rules are not style:
 * they are what keeps data access out of components and framework code out
 * of the domain packages. Do not loosen them to make a file pass; move the
 * code to where it belongs.
 */
export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/dist/**",
    "**/coverage/**",
    "**/next-env.d.ts",
    "**/supabase/.temp/**",
    // macOS AppleDouble sidecars; binary metadata, not source. See .gitignore.
    "**/._*",
  ]),

  ...nextVitals,
  ...nextTs,
  {
    settings: {
      next: { rootDir: "apps/web/" },
    },
  },

  // --- apps/web: data access only in the designated modules ------------------
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    ignores: [
      "apps/web/src/lib/supabase/**",
      "apps/web/src/features/**/queries.ts",
      "apps/web/src/features/**/actions.ts",
      "apps/web/src/proxy.ts",
      "apps/web/src/**/*.test.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@supabase/*", "@momentum/db", "@momentum/db/*"],
              message:
                "Data access lives in features/<feature>/queries.ts, features/<feature>/actions.ts, or lib/supabase/ (docs/ARCHITECTURE.md §6).",
            },
            {
              group: ["date-fns", "date-fns/*", "@date-fns/*"],
              message: "Use @momentum/core/time; no direct date-fns in the app (Domain Rule 5).",
            },
          ],
        },
      ],
    },
  },

  // --- apps/web components: no ad-hoc date construction ----------------------
  {
    files: ["apps/web/src/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date']",
          message:
            "No ad-hoc dates in components. Use @momentum/core/time and the useNow() hook (Domain Rule 5).",
        },
      ],
    },
  },

  // --- packages/core: framework-free -----------------------------------------
  {
    files: ["packages/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react",
                "react-dom",
                "next",
                "next/*",
                "@supabase/*",
                "@momentum/db",
                "@momentum/db/*",
                "@momentum/ui",
                "@momentum/ui/*",
              ],
              message: "@momentum/core is framework-free (docs/ARCHITECTURE.md §2).",
            },
          ],
        },
      ],
    },
  },

  // --- packages/db: no React, no Next ----------------------------------------
  {
    files: ["packages/db/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-dom", "next", "next/*", "@momentum/ui", "@momentum/ui/*"],
              message: "@momentum/db is framework-free (docs/ARCHITECTURE.md §2).",
            },
          ],
        },
      ],
    },
  },

  // --- packages/ui: presentational, no Next, no data -------------------------
  {
    files: ["packages/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/*", "@supabase/*", "@momentum/db", "@momentum/db/*"],
              message:
                "@momentum/ui is presentational and framework-agnostic; Next-aware composition lives in apps/web (docs/ARCHITECTURE.md §2).",
            },
          ],
        },
      ],
    },
  },

  // --- the service worker: a different global scope entirely ----------------
  {
    files: ["apps/web/public/sw.js"],
    languageOptions: {
      // Not a browser page and not a module: `self` is a
      // `ServiceWorkerGlobalScope`, and the lifecycle globals below exist only
      // here. Declaring them is what lets this file be linted like the rest of
      // the codebase instead of being excluded from it.
      globals: {
        self: "readonly",
        caches: "readonly",
        clients: "readonly",
        fetch: "readonly",
        Request: "readonly",
        Response: "readonly",
        URL: "readonly",
        Promise: "readonly",
      },
    },
  },

  prettier,
]);
