/**
 * The build stamp the service worker is registered under. `next.config.ts`
 * computes it once per build and inlines it, so every client in a deployment
 * agrees on the value and a new deployment always has a new one; a changed
 * `?v=` is the only thing that makes the browser re-install a byte-identical
 * `sw.js`. The fallback is for `next dev` and tests, where no worker is registered.
 */
export const BUILD_VERSION: string = process.env.NEXT_PUBLIC_BUILD_VERSION || "dev";

/** The URL a given build's worker is registered under. */
export function serviceWorkerUrl(version: string): string {
  return `/sw.js?v=${encodeURIComponent(version)}`;
}

/** The URL this build registers on load. */
export const SERVICE_WORKER_URL = serviceWorkerUrl(BUILD_VERSION);

/** Where the running server reports its own build (`app/version/route.ts`). */
export const VERSION_ENDPOINT = "/version";
