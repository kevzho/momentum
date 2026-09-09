/**
 * Momentum's service worker.
 *
 * Read the rule before the code, because the rule is the whole design:
 *
 *   **A stale worker serving an old bundle is worse than no worker at all.**
 *
 * Everything below follows from that. Three consequences, in order of how much
 * they matter:
 *
 * 1. **No HTML is ever cached.** A navigation goes to the network, and if the
 *    network is not there it gets the offline page — it never gets yesterday's
 *    render of /today. That is also what keeps this worker honest about a
 *    signed-in, per-user, database-backed product: page HTML is one user's
 *    data, and Cache Storage is the wrong place for it (docs/ARCHITECTURE.md,
 *    "Platform implications"). The practical effect is that a deploy is live
 *    for an online user on their next navigation, with no worker in the way.
 *
 * 2. **Only immutable assets are cached, and only cache-first.** Everything
 *    under /_next/static/ is content-hashed by the build: a new deploy is a new
 *    URL, so a hit can never be stale and a miss is just a fetch. Nothing else
 *    is stored.
 *
 * 3. **Nothing else is touched at all.** Not server actions (POST), not RSC
 *    payloads, not route handlers, not Supabase. `fetch` on those is left to
 *    the browser, so an offline mutation rejects exactly as it would without a
 *    worker installed and surfaces through `useOptimisticAction`'s `unavailable`
 *    path. A worker that answered a mutation from a cache would be the "silently
 *    swallowed" failure specs/12-pwa.md forbids.
 *
 * The worker itself updates through its script URL: the page registers
 * `/sw.js?v=<build>` (see components/service-worker.tsx), so every build is a
 * different registration script, and `updateViaCache: "none"` means the browser
 * re-fetches it rather than trusting an HTTP cache. The new worker installs,
 * waits, and the page offers a reload — it never activates under a running app
 * on its own, because swapping the worker out from under a loaded bundle is the
 * other half of the staleness problem.
 */

/**
 * Build stamp, from the registration URL. Cache names carry it so that a worker
 * from an older build cannot read or write this build's caches, and `activate`
 * deletes anything that is not ours.
 */
const VERSION = new URL(self.location.href).searchParams.get("v") ?? "dev";

const CACHE_PREFIX = "momentum-";
const STATIC_CACHE = `${CACHE_PREFIX}static-${VERSION}`;
const SHELL_CACHE = `${CACHE_PREFIX}shell-${VERSION}`;

/** The one document this worker stores: a self-contained, data-free page. */
const OFFLINE_URL = "/offline.html";

/** Immutable, content-hashed build output. The only thing worth caching. */
const IMMUTABLE_PATH = "/_next/static/";

/** Installed alongside the offline page so it can never render bare. */
const SHELL_ASSETS = [OFFLINE_URL, "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // `reload` skips the HTTP cache: the offline page that gets stored has to
      // be this build's, not whatever a proxy still holds from the last one.
      await cache.addAll(SHELL_ASSETS.map((url) => new Request(url, { cache: "reload" })));
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Navigation preload lets the browser start the network request for a
      // navigation in parallel with waking this worker, so having a worker
      // installed does not cost a round trip on every page load.
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }

      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE && key !== SHELL_CACHE,
          )
          .map((key) => caches.delete(key)),
      );

      // Take over open tabs immediately. Safe here only because this worker
      // never answers a navigation from cache: an old tab that starts being
      // controlled mid-session keeps getting the network, not another build.
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  // Sent by the update prompt, and only after the user asks for the new version.
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const strategy = strategyFor(event.request);

  if (strategy === "passthrough") return;

  if (strategy === "navigate") {
    event.respondWith(networkThenOfflinePage(event));
    return;
  }

  event.respondWith(cacheFirst(event.request));
});

/**
 * The routing table, as one pure function — the only decision this worker makes.
 *
 * `"passthrough"` means "do not call `respondWith`", which leaves the request
 * entirely to the browser. That is the default on purpose: every request this
 * file does not explicitly understand behaves as though no worker were
 * installed.
 *
 * @param {Request} request
 * @returns {"navigate" | "immutable" | "passthrough"}
 */
function strategyFor(request) {
  // A mutation is never ours. Server actions are POSTs; answering one from a
  // cache, or retrying one, would be inventing a result the server never gave.
  if (request.method !== "GET") return "passthrough";

  const url = new URL(request.url);

  // Another origin's caching is that origin's business — and Supabase in
  // particular must never be served from a local copy.
  if (url.origin !== self.location.origin) return "passthrough";

  // An RSC payload is data: it is the response to a client-side navigation and
  // carries the same per-user rows the HTML would. Never stored, and never
  // answered with the offline page — the router handles its own failure, and a
  // page of HTML in place of a payload would be a parse error, not a fallback.
  if (url.searchParams.has("_rsc") || request.headers.get("RSC") === "1") {
    return "passthrough";
  }

  // Content-hashed build output. `/_next/image` is deliberately excluded: it is
  // a query-keyed transform, not an immutable URL.
  if (url.pathname.startsWith(IMMUTABLE_PATH)) return "immutable";

  // The icons and the offline page: stable URLs, installed above, needed
  // offline. Nothing else in /public is cached — /public also holds nothing else.
  if (url.pathname === OFFLINE_URL || url.pathname.startsWith("/icons/")) {
    return "immutable";
  }

  if (request.mode === "navigate") return "navigate";

  return "passthrough";
}

/**
 * Navigations: the network, or the offline page. Never a cached document.
 *
 * @param {FetchEvent} event
 */
async function networkThenOfflinePage(event) {
  try {
    const preloaded = await event.preloadResponse;
    if (preloaded) return preloaded;
    return await fetch(event.request);
  } catch {
    // Reached only when the network is genuinely unavailable — a 4xx or 5xx is
    // a response and is returned above, because the server's own error page is
    // more truthful than "you are offline".
    const cache = await caches.open(SHELL_CACHE);
    const offline = await cache.match(OFFLINE_URL);
    return (
      offline ??
      new Response("You are offline.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}

/**
 * Immutable assets: the cache if it has them, otherwise the network, storing
 * only a response that is actually a success. A cached opaque or error response
 * would poison the URL for the life of the build.
 *
 * The lookup is `caches.match`, across every cache, not `STATIC_CACHE.match`:
 * the shell assets were installed into their own cache and are requested
 * through this path too. Writes still go to `STATIC_CACHE` only, so the shell
 * cache stays exactly the small, known set `install` put there.
 *
 * On a network failure with nothing cached, the returned promise rejects, and
 * a rejected `respondWith` is a network error — which is precisely what the
 * request would have been with no worker installed.
 *
 * @param {Request} request
 */
async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}
