import { execFileSync } from "node:child_process";

import type { NextConfig } from "next";

/**
 * A stamp that changes exactly when the deployed code changes.
 *
 * The service worker is registered as `/sw.js?v=<this>`, so this value *is* the
 * update mechanism: a new deployment must produce a new one, and every client
 * in the same deployment must see the same one. Both matter — a value that
 * never changed would leave a worker serving an old build's caches forever, and
 * one that differed per server instance would re-register the worker on every
 * request that happened to hit a different box.
 *
 * `env` is what makes the second half true: Next inlines these at build time,
 * so the string is frozen into the output rather than read from the process at
 * runtime. The commit SHA is preferred because it is the same on every machine
 * that builds the same tree; the timestamp is the local-build fallback, and is
 * computed here, once, for the same reason.
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
    // No git, no CI variable: a shallow tarball or a bare container. A
    // timestamp still satisfies the one requirement — it is different from
    // whatever the previous build used.
    return `t${Date.now().toString(36)}`;
  }
}

const nextConfig: NextConfig = {
  // Workspace packages are consumed as TypeScript source (no build step).
  transpilePackages: ["@momentum/core", "@momentum/db", "@momentum/ui"],
  // Statically typed <Link href> and router.push targets.
  typedRoutes: true,

  env: {
    NEXT_PUBLIC_BUILD_VERSION: resolveBuildVersion(),
  },

  // The framework banner is free reconnaissance; nothing needs it.
  poweredByHeader: false,

  async headers() {
    return [
      {
        /*
         * Baseline security headers on every response. These are the ones that
         * are safe to apply blanket: they change no rendering and depend on no
         * per-request nonce.
         *
         *   X-Content-Type-Options   stop MIME sniffing.
         *   Referrer-Policy          send only the origin cross-site.
         *   X-Frame-Options + CSP frame-ancestors  the app is never framed
         *                            (clickjacking defence; SameSite=lax cookies
         *                            already make a framed page render signed
         *                            out, this makes it explicit).
         *   Permissions-Policy       deny device APIs the app does not use.
         *   Strict-Transport-Security  pin HTTPS; harmless where the host
         *                            already sends it, and the fix where it does
         *                            not. Ignored by browsers over plain HTTP.
         *
         * A full script-src Content-Security-Policy is deliberately not set here:
         * it needs a per-request nonce threaded through proxy.ts to cover Next's
         * and next-themes' inline scripts without 'unsafe-inline', which is a
         * larger change tracked in docs/ROADMAP.md. frame-ancestors is safe to
         * ship now because it governs no script.
         */
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
        /*
         * The worker script must never be answered from an HTTP cache. The
         * registration already asks for that with `updateViaCache: "none"`, but
         * that governs the browser; this governs every proxy and CDN between
         * here and it. A `sw.js` held for even a few minutes past a deploy is
         * the stale-worker failure specs/12-pwa.md is about.
         *
         * The file is byte-identical across deploys, so nothing is lost by not
         * caching it: what changes is the `?v=` on the URL.
         */
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "text/javascript; charset=utf-8" },
          // Root scope from a root-served script needs no permission, but
          // stating it means a later move of the file cannot silently narrow
          // the worker's scope to wherever it landed.
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        /*
         * The offline page has to be re-fetched by each new worker's `install`
         * (which asks for `cache: "reload"`), and it is the one document that
         * being stale would actively mislead about.
         */
        source: "/offline.html",
        headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }],
      },
      {
        // Regenerated only by hand, referenced by hashless URLs from the
        // manifest, and cached by the worker anyway.
        source: "/icons/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
