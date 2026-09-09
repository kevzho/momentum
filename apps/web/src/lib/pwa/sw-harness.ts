import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";

/**
 * Runs `public/sw.js` (the real file, unmodified) in a fake
 * `ServiceWorkerGlobalScope`. `runInContext` puts the worker's own function
 * declarations on the context object, which is how `strategyFor` becomes
 * directly assertable.
 */

const SOURCE = readFileSync(join(import.meta.dirname, "..", "..", "..", "public", "sw.js"), "utf8");

export interface FakeResponse {
  readonly body: string;
  readonly ok: boolean;
  readonly type: string;
  clone(): FakeResponse;
}

export function response(body: string, init?: { ok?: boolean; type?: string }): FakeResponse {
  const value: FakeResponse = {
    body,
    ok: init?.ok ?? true,
    type: init?.type ?? "basic",
    clone: () => value,
  };
  return value;
}

/** Just enough `Request` for the worker: a URL, a method, a mode and headers. */
class FakeRequest {
  readonly url: string;
  readonly method: string;
  readonly mode: string;
  readonly headers: { get(name: string): string | null };
  readonly cache: string | undefined;

  constructor(
    input: string | FakeRequest,
    init: { method?: string; mode?: string; headers?: Record<string, string>; cache?: string } = {},
  ) {
    const base = typeof input === "string" ? undefined : input;
    this.url = typeof input === "string" ? new URL(input, ORIGIN).href : input.url;
    this.method = init.method ?? base?.method ?? "GET";
    this.mode = init.mode ?? base?.mode ?? "no-cors";
    this.cache = init.cache;
    const headers = new Map(
      Object.entries(init.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]),
    );
    this.headers = { get: (name) => headers.get(name.toLowerCase()) ?? null };
  }
}

export const ORIGIN = "https://momentum.test";

class FakeCache {
  readonly entries = new Map<string, FakeResponse>();

  match(request: FakeRequest | string): Promise<FakeResponse | undefined> {
    const url = typeof request === "string" ? new URL(request, ORIGIN).href : request.url;
    return Promise.resolve(this.entries.get(url));
  }

  async put(request: FakeRequest | string, value: FakeResponse): Promise<void> {
    const url = typeof request === "string" ? new URL(request, ORIGIN).href : request.url;
    this.entries.set(url, value);
  }

  async addAll(requests: Array<FakeRequest | string>): Promise<void> {
    for (const request of requests) {
      const url = typeof request === "string" ? new URL(request, ORIGIN).href : request.url;
      const fetched = await this.fetcher(request);
      this.entries.set(url, fetched);
    }
  }

  /** Replaced by the harness so `addAll` goes through the same fetch stub. */
  fetcher: (request: FakeRequest | string) => Promise<FakeResponse> = async () => response("");
}

export interface Harness {
  /** Cache name → contents, exactly as the worker left it. */
  caches: Map<string, FakeCache>;
  /** Every URL the worker asked the network for, in order. */
  fetched: string[];
  /** Set this to make the network fail, as being offline does. */
  offline: boolean;
  /** Make one URL answer with a non-ok response. */
  failFor(path: string): void;
  /** Create a cache as if an earlier build (or another library) had left it. */
  seedCache(name: string): void;
  /** True once the worker has called `skipWaiting()`. */
  skippedWaiting: boolean;
  /** True once the worker has claimed open clients. */
  claimed: boolean;
  navigationPreloadEnabled: boolean;

  request(url: string, init?: Record<string, unknown>): FakeRequest;
  install(): Promise<void>;
  activate(): Promise<void>;
  message(data: unknown): void;
  /** The worker's answer, or `"passthrough"` when it declined the request. */
  fetchEvent(
    request: FakeRequest,
    options?: { preload?: FakeResponse },
  ): Promise<FakeResponse | "passthrough">;
  strategyFor(request: FakeRequest): string;
}

/** Loads the worker at a given build stamp, as the page's registration would. */
export function loadServiceWorker(version = "test-build"): Harness {
  const listeners = new Map<string, (event: Record<string, unknown>) => void>();
  const cacheStore = new Map<string, FakeCache>();
  const state = {
    fetched: [] as string[],
    failing: new Set<string>(),
    offline: false,
    skippedWaiting: false,
    claimed: false,
    navigationPreloadEnabled: false,
  };

  const fetchStub = async (request: FakeRequest | string): Promise<FakeResponse> => {
    const url = typeof request === "string" ? new URL(request, ORIGIN).href : request.url;
    state.fetched.push(url);
    if (state.offline) throw new TypeError("Failed to fetch");
    if (state.failing.has(url)) return response(`error:${url}`, { ok: false });
    return response(`network:${url}`);
  };

  const cachesStub = {
    async open(name: string) {
      let cache = cacheStore.get(name);
      if (!cache) {
        cache = new FakeCache();
        cache.fetcher = fetchStub;
        cacheStore.set(name, cache);
      }
      return cache;
    },
    async keys() {
      return [...cacheStore.keys()];
    },
    async delete(name: string) {
      return cacheStore.delete(name);
    },
    async match(request: FakeRequest | string) {
      for (const cache of cacheStore.values()) {
        const hit = await cache.match(request);
        if (hit) return hit;
      }
      return undefined;
    },
  };

  const self = {
    location: { href: `${ORIGIN}/sw.js?v=${version}`, origin: ORIGIN },
    registration: {
      navigationPreload: {
        async enable() {
          state.navigationPreloadEnabled = true;
        },
      },
    },
    clients: {
      async claim() {
        state.claimed = true;
      },
    },
    skipWaiting() {
      state.skippedWaiting = true;
    },
    addEventListener(type: string, listener: (event: Record<string, unknown>) => void) {
      listeners.set(type, listener);
    },
  };

  const context = createContext({
    self,
    caches: cachesStub,
    fetch: fetchStub,
    Request: FakeRequest,
    Response: class {
      constructor(
        readonly body: string,
        readonly init?: unknown,
      ) {}
      readonly ok = false;
      readonly type = "default";
      clone() {
        return this;
      }
    },
    URL,
    TypeError,
    Promise,
  });

  runInContext(SOURCE, context, { filename: "sw.js" });

  const dispatch = async (type: string, event: Record<string, unknown>) => {
    const listener = listeners.get(type);
    if (!listener) throw new Error(`sw.js registered no "${type}" listener`);
    listener(event);
  };

  return {
    caches: cacheStore,
    get fetched() {
      return state.fetched;
    },
    get offline() {
      return state.offline;
    },
    set offline(value: boolean) {
      state.offline = value;
    },
    get skippedWaiting() {
      return state.skippedWaiting;
    },
    get claimed() {
      return state.claimed;
    },
    get navigationPreloadEnabled() {
      return state.navigationPreloadEnabled;
    },

    request: (url, init) => new FakeRequest(url, init ?? {}),

    failFor(path) {
      state.failing.add(new URL(path, ORIGIN).href);
    },

    seedCache(name) {
      const cache = new FakeCache();
      cache.fetcher = fetchStub;
      cacheStore.set(name, cache);
    },

    async install() {
      let waited: Promise<unknown> = Promise.resolve();
      await dispatch("install", { waitUntil: (promise: Promise<unknown>) => (waited = promise) });
      await waited;
    },

    async activate() {
      let waited: Promise<unknown> = Promise.resolve();
      await dispatch("activate", { waitUntil: (promise: Promise<unknown>) => (waited = promise) });
      await waited;
    },

    message(data: unknown) {
      void dispatch("message", { data });
    },

    async fetchEvent(request, options) {
      let answered: Promise<FakeResponse> | undefined;
      await dispatch("fetch", {
        request,
        preloadResponse: Promise.resolve(options?.preload),
        respondWith: (promise: Promise<FakeResponse>) => (answered = promise),
      });
      if (!answered) return "passthrough";
      return answered;
    },

    strategyFor(request) {
      return (context as { strategyFor: (request: FakeRequest) => string }).strategyFor(request);
    },
  };
}
