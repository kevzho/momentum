import { execFileSync } from "node:child_process";

import type { NextConfig } from "next";

/**
 * A stamp that changes exactly when the deployed code changes. The service
 * worker is registered as `/sw.js?v=<this>`, so it must differ per deployment
 * and be identical across server instances of one deployment; `env` inlines it
 * at build time, which is what makes the second half true.
 */
function resolveBuildVersion(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_BUILD_VERSION ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GITHUB_SHA ??
    process.env.CF_PAGES_COMMIT_SHA;
  if (fromEnv) return fromEnv.slice(0, 12);

  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // No git, no CI variable: a timestamp still differs from the previous build.
    return `t${Date.now().toString(36)}`;
  }
}

const nextConfig: NextConfig = {
  transpilePackages: ["@momentum/core", "@momentum/db", "@momentum/ui"],
  typedRoutes: true,

  env: {
    NEXT_PUBLIC_BUILD_VERSION: resolveBuildVersion(),
  },

  poweredByHeader: false,

  async headers() {
    return [
      {
        // Baseline security headers. A full script-src CSP is deliberately not
        // set: it needs a per-request nonce threaded through proxy.ts to cover
        // Next's and next-themes' inline scripts (tracked in docs/ROADMAP.md).
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
      {
        // `updateViaCache: "none"` governs the browser; this governs every proxy
        // and CDN in between. The file is byte-identical across deploys, so
        // nothing is lost by not caching it.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "text/javascript; charset=utf-8" },
          // Stated so a later move of the file cannot silently narrow the scope.
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Re-fetched by each new worker's `install` with `cache: "reload"`.
        source: "/offline.html",
        headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }],
      },
      {
        source: "/icons/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
