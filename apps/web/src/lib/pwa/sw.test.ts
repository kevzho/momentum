import { describe, expect, it } from "vitest";

import { loadServiceWorker, ORIGIN, response } from "@/lib/pwa/sw-harness";

/**
 * The service worker's contract, asserted against the real `public/sw.js`.
 *
 * The organising claim of the file is that a stale worker serving an old bundle
 * is worse than no worker, so most of what is checked here is what the worker
 * refuses to do.
 */

describe("service worker — what it never touches", () => {
  it("passes through a server action, so an offline mutation still fails", async () => {
    const sw = loadServiceWorker();
    await sw.install();
    await sw.activate();
    sw.offline = true;

    const action = sw.request("/today", { method: "POST", mode: "same-origin" });

    // Not answered at all: no `respondWith`, so the browser's own fetch runs
    // and rejects. That rejection is what `useOptimisticAction` turns into the
    // `unavailable` toast — a worker that answered here would be the "silently
    // swallowed" mutation specs/12-pwa.md forbids.
    expect(await sw.fetchEvent(action)).toBe("passthrough");
    expect(sw.strategyFor(action)).toBe("passthrough");
  });

  it("passes through RSC payloads rather than answering them with a page", async () => {
    const sw = loadServiceWorker();

    const byQuery = sw.request("/calendar?week=2026-09-07&_rsc=1a2b3c", { mode: "cors" });
    const byHeader = sw.request("/calendar", { mode: "cors", headers: { RSC: "1" } });

    expect(sw.strategyFor(byQuery)).toBe("passthrough");
    expect(sw.strategyFor(byHeader)).toBe("passthrough");
    expect(await sw.fetchEvent(byQuery)).toBe("passthrough");
  });

  it("passes through another origin, so Supabase is never served from a cache", () => {
    const sw = loadServiceWorker();
    const supabase = sw.request("https://project.supabase.co/rest/v1/tasks", { mode: "cors" });

    expect(sw.strategyFor(supabase)).toBe("passthrough");
  });

  it("passes through an ordinary same-origin GET that is not a navigation", () => {
    const sw = loadServiceWorker();

    expect(sw.strategyFor(sw.request("/auth/callback?code=abc", { mode: "cors" }))).toBe(
      "passthrough",
    );
    // A query-keyed transform, not an immutable URL.
    expect(sw.strategyFor(sw.request("/_next/image?url=%2Ficons%2Ficon-192.png&w=64"))).toBe(
      "passthrough",
    );
  });

  it("never stores a document", async () => {
    const sw = loadServiceWorker();
    await sw.install();
    await sw.activate();

    const navigation = sw.request("/today", { mode: "navigate" });
    await sw.fetchEvent(navigation);

    const stored = [...sw.caches.values()].flatMap((cache) => [...cache.entries.keys()]);
    expect(stored).not.toContain(`${ORIGIN}/today`);
    // A deploy therefore reaches an online user on their next navigation.
    expect(sw.fetched).toContain(`${ORIGIN}/today`);
  });
});

describe("service worker — install and activate", () => {
  it("precaches the offline page from the network, not the HTTP cache", async () => {
    const sw = loadServiceWorker("build-1");
    await sw.install();

    const shell = sw.caches.get("momentum-shell-build-1");
    expect(shell).toBeDefined();
    expect([...shell!.entries.keys()]).toContain(`${ORIGIN}/offline.html`);
    expect(sw.fetched).toContain(`${ORIGIN}/offline.html`);
  });

  it("names its caches after the build stamp in its own script URL", async () => {
    const sw = loadServiceWorker("build-2");
    await sw.install();

    expect([...sw.caches.keys()]).toEqual(["momentum-shell-build-2"]);
  });

  it("deletes every cache from another build on activate", async () => {
    const sw = loadServiceWorker("build-2");
    // What a previous deployment left behind, plus something that is not ours.
    sw.seedCache("momentum-static-build-1");
    sw.seedCache("momentum-shell-build-1");
    sw.seedCache("some-other-library");

    await sw.install();
    await sw.activate();

    expect([...sw.caches.keys()].sort()).toEqual(["momentum-shell-build-2", "some-other-library"]);
  });

  it("enables navigation preload and claims open clients", async () => {
    const sw = loadServiceWorker();
    await sw.install();
    await sw.activate();

    expect(sw.navigationPreloadEnabled).toBe(true);
    expect(sw.claimed).toBe(true);
  });

  it("only skips waiting when the page asks it to", async () => {
    const sw = loadServiceWorker();
    await sw.install();
    expect(sw.skippedWaiting).toBe(false);

    sw.message({ type: "something-else" });
    expect(sw.skippedWaiting).toBe(false);

    // Sent by the "Reload" action on the update toast, and only by it.
    sw.message({ type: "SKIP_WAITING" });
    expect(sw.skippedWaiting).toBe(true);
  });
});

describe("service worker — navigations", () => {
  it("serves the network, and prefers the preloaded response", async () => {
    const sw = loadServiceWorker();
    await sw.install();
    await sw.activate();

    const preloaded = response("preloaded /today");
    const answer = await sw.fetchEvent(sw.request("/today", { mode: "navigate" }), {
      preload: preloaded,
    });

    expect(answer).toBe(preloaded);
  });

  it("falls back to the offline page only when the network is gone", async () => {
    const sw = loadServiceWorker();
    await sw.install();
    await sw.activate();
    sw.offline = true;

    const answer = await sw.fetchEvent(sw.request("/today", { mode: "navigate" }));

    expect(answer).not.toBe("passthrough");
    expect((answer as { body: string }).body).toBe(`network:${ORIGIN}/offline.html`);
  });

  it("returns the server's own error page rather than claiming the user is offline", async () => {
    const sw = loadServiceWorker();
    await sw.install();
    await sw.activate();

    // A 500 is a response, not a network failure: the worker hands it back.
    const answer = await sw.fetchEvent(sw.request("/today", { mode: "navigate" }), {
      preload: response("server error", { ok: false }),
    });

    expect((answer as { body: string }).body).toBe("server error");
  });
});

describe("service worker — immutable assets", () => {
  it("caches content-hashed build output and then serves it without the network", async () => {
    const sw = loadServiceWorker();
    await sw.install();
    await sw.activate();

    const chunk = sw.request("/_next/static/chunks/main-9f2c.js", { mode: "cors" });
    expect(sw.strategyFor(chunk)).toBe("immutable");

    await sw.fetchEvent(chunk);
    expect(sw.fetched).toContain(`${ORIGIN}/_next/static/chunks/main-9f2c.js`);

    sw.offline = true;
    const offlineAnswer = await sw.fetchEvent(chunk);
    expect((offlineAnswer as { body: string }).body).toBe(
      `network:${ORIGIN}/_next/static/chunks/main-9f2c.js`,
    );
  });

  it("refuses to cache a failed response, which would poison the URL", async () => {
    const sw = loadServiceWorker();
    await sw.install();
    await sw.activate();
    sw.failFor("/_next/static/chunks/gone-1234.js");

    const missing = sw.request("/_next/static/chunks/gone-1234.js", { mode: "cors" });
    const answer = await sw.fetchEvent(missing);

    // The error is handed back — but not stored. A cached 404 under a
    // content-hashed URL would be permanent for the life of the build.
    expect((answer as { body: string }).body).toBe(
      `error:${ORIGIN}/_next/static/chunks/gone-1234.js`,
    );
    const stored = [...sw.caches.values()].flatMap((cache) => [...cache.entries.keys()]);
    expect(stored).not.toContain(`${ORIGIN}/_next/static/chunks/gone-1234.js`);
  });

  it("serves a shell asset from the shell cache, not only the static one", async () => {
    const sw = loadServiceWorker();
    await sw.install();
    await sw.activate();
    sw.offline = true;

    // Installed into `momentum-shell-*`; requested through the immutable path,
    // which looks in every cache. Without that, an icon would 404 offline.
    const icon = sw.request("/icons/icon-192.png", { mode: "cors" });
    const answer = await sw.fetchEvent(icon);

    expect((answer as { body: string }).body).toBe(`network:${ORIGIN}/icons/icon-192.png`);
  });
});
