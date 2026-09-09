/**
 * The build stamp the service worker is registered under.
 *
 * `next.config.ts` computes it once per build and inlines it here, so every
 * client in a deployment agrees on the value and a new deployment always has a
 * new one. That is the whole update mechanism: the page registers
 * `/sw.js?v=<version>`, a changed query is a changed script URL, and a changed
 * script URL is a registration the browser must re-install. Without it, a
 * byte-identical `sw.js` would go on serving the caches it built for an older
 * deployment.
 *
 * The fallback exists for `next dev` and for the test environment, where no
 * worker is registered at all.
 */
export const BUILD_VERSION: string = process.env.NEXT_PUBLIC_BUILD_VERSION || "dev";

/** The URL a given build's worker is registered under. */
export function serviceWorkerUrl(version: string): string {
  return `/sw.js?v=${encodeURIComponent(version)}`;
}

/** The URL this build registers on load. */
export const SERVICE_WORKER_URL = serviceWorkerUrl(BUILD_VERSION);

/**
 * Where the running server reports its own build (`app/version/route.ts`).
 *
 * Polled rather than inferred, because the worker script is byte-identical
 * across builds and `registration.update()` therefore cannot see a deploy.
 */
export const VERSION_ENDPOINT = "/version";
