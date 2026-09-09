import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceWorker } from "@/components/service-worker";
import { BUILD_VERSION, SERVICE_WORKER_URL, serviceWorkerUrl } from "@/lib/pwa/build-version";

const { toastInfo } = vi.hoisted(() => ({ toastInfo: vi.fn() }));

vi.mock("@momentum/ui/components/toast", () => ({ toast: { info: toastInfo } }));

interface FakeWorker {
  state: string;
  postMessage: ReturnType<typeof vi.fn>;
  fire(state: string): void;
}

function fakeWorker(state = "installing"): FakeWorker {
  const listeners: Array<() => void> = [];
  const worker = {
    state,
    postMessage: vi.fn(),
    addEventListener: (type: string, listener: () => void) => {
      if (type === "statechange") listeners.push(listener);
    },
    fire(next: string) {
      worker.state = next;
      for (const listener of listeners) listener();
    },
  };
  return worker as unknown as FakeWorker;
}

function fakeRegistration() {
  const listeners: Array<() => void> = [];
  return {
    installing: null as FakeWorker | null,
    waiting: null as FakeWorker | null,
    update: vi.fn().mockResolvedValue(undefined),
    addEventListener(type: string, listener: () => void) {
      if (type === "updatefound") listeners.push(listener);
    },
    /** What the browser does when a new script starts installing. */
    startInstalling(worker: FakeWorker) {
      this.installing = worker;
      for (const listener of listeners) listener();
    },
  };
}

type Registration = ReturnType<typeof fakeRegistration>;

function installContainer(registration: Registration, controller: unknown) {
  const containerListeners = new Map<string, Array<() => void>>();
  const container = {
    controller,
    register: vi.fn().mockResolvedValue(registration),
    getRegistrations: vi.fn().mockResolvedValue([]),
    addEventListener(type: string, listener: () => void) {
      const existing = containerListeners.get(type) ?? [];
      containerListeners.set(type, [...existing, listener]);
    },
    removeEventListener() {},
    fire(type: string) {
      for (const listener of containerListeners.get(type) ?? []) listener();
    },
  };
  Object.defineProperty(window.navigator, "serviceWorker", {
    value: container,
    configurable: true,
  });
  return container;
}

/** What `/version` answers. Defaults to the same build. */
function serveVersion(version: string | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: version !== null,
      json: async () => ({ version }),
    }),
  );
}

const reload = vi.fn();

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  serveVersion(BUILD_VERSION);
  reload.mockClear();
  toastInfo.mockClear();
  Object.defineProperty(window, "location", {
    value: { ...window.location, reload },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function becomeVisible(): void {
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("ServiceWorker registration", () => {
  it("registers the build-stamped script, bypassing the HTTP cache", async () => {
    const container = installContainer(fakeRegistration(), null);
    render(<ServiceWorker />);

    await waitFor(() => expect(container.register).toHaveBeenCalledOnce());
    expect(container.register).toHaveBeenCalledWith(SERVICE_WORKER_URL, {
      scope: "/",
      updateViaCache: "none",
    });
    // `public/sw.js` is byte-identical across deploys; the changed query is what
    // makes the browser treat it as a new script.
    expect(SERVICE_WORKER_URL).toMatch(/^\/sw\.js\?v=.+/);
  });

  it("registers nothing outside production, and tears down what is there", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const registration = fakeRegistration();
    const container = installContainer(registration, null);

    render(<ServiceWorker />);

    await waitFor(() => expect(container.getRegistrations).toHaveBeenCalled());
    expect(container.register).not.toHaveBeenCalled();
  });

  it("offers the update once a new worker is installed behind an old one", async () => {
    const registration = fakeRegistration();
    const container = installContainer(registration, { fake: "controller" });
    render(<ServiceWorker />);
    await waitFor(() => expect(container.register).toHaveBeenCalled());

    const incoming = fakeWorker();
    registration.startInstalling(incoming);
    incoming.fire("installed");

    await waitFor(() => expect(toastInfo).toHaveBeenCalledOnce());
    const [message, options] = toastInfo.mock.calls[0] as [string, { duration: number }];
    expect(message).toMatch(/new version/i);
    // Waits for the user rather than expiring.
    expect(options.duration).toBe(Infinity);
  });

  it("says nothing on a first install, when there is no old bundle to replace", async () => {
    const registration = fakeRegistration();
    const container = installContainer(registration, null); // no controller yet
    render(<ServiceWorker />);
    await waitFor(() => expect(container.register).toHaveBeenCalled());

    const first = fakeWorker();
    registration.startInstalling(first);
    first.fire("installed");

    expect(toastInfo).not.toHaveBeenCalled();
  });

  it("offers an update that installed during an earlier visit", async () => {
    const registration = fakeRegistration();
    // The user closed the tab before reloading; the worker is still waiting.
    registration.waiting = fakeWorker("installed");
    const container = installContainer(registration, { fake: "controller" });

    render(<ServiceWorker />);

    await waitFor(() => expect(toastInfo).toHaveBeenCalledOnce());
    expect(container.register).toHaveBeenCalled();
  });

  it("activates the waiting worker only when the user asks", async () => {
    const registration = fakeRegistration();
    registration.waiting = fakeWorker("installed");
    installContainer(registration, { fake: "controller" });
    render(<ServiceWorker />);
    await waitFor(() => expect(toastInfo).toHaveBeenCalledOnce());

    const [, options] = toastInfo.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(registration.waiting.postMessage).not.toHaveBeenCalled();

    expect(options.action.label).toBe("Reload");
    options.action.onClick();

    expect(registration.waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });

  it("reloads once when the new worker takes control, and not again", async () => {
    const container = installContainer(fakeRegistration(), { fake: "controller" });
    render(<ServiceWorker />);
    await waitFor(() => expect(container.register).toHaveBeenCalled());

    // Without this the page keeps running the old bundle under the new worker.
    container.fire("controllerchange");
    expect(reload).toHaveBeenCalledOnce();

    container.fire("controllerchange");
    expect(reload).toHaveBeenCalledOnce();
  });

  it("does not reload when the very first worker claims the page", async () => {
    // No controller: this page loaded before any worker existed and the bundle
    // on screen is already current.
    const container = installContainer(fakeRegistration(), null);
    render(<ServiceWorker />);
    await waitFor(() => expect(container.register).toHaveBeenCalled());

    container.fire("controllerchange");

    expect(reload).not.toHaveBeenCalled();
  });

  it("re-checks on focus, and calls update() while the server is on this build", async () => {
    const registration = fakeRegistration();
    const container = installContainer(registration, { fake: "controller" });
    render(<ServiceWorker />);
    await waitFor(() => expect(container.register).toHaveBeenCalled());

    registration.update.mockClear();
    becomeVisible();

    // Same build: `update()` still runs in case `sw.js` itself changed.
    await waitFor(() => expect(registration.update).toHaveBeenCalled());
    expect(container.register).toHaveBeenCalledTimes(1);
  });

  it("registers the new build's worker when the server says it has moved on", async () => {
    // A tab open across a deploy: `registration.update()` cannot see it because
    // the bytes at the registered URL have not changed, and the client router
    // only fetches RSC payloads.
    const registration = fakeRegistration();
    const container = installContainer(registration, { fake: "controller" });
    render(<ServiceWorker />);
    await waitFor(() => expect(container.register).toHaveBeenCalled());

    serveVersion("a-later-build");
    becomeVisible();

    await waitFor(() =>
      expect(container.register).toHaveBeenCalledWith(serviceWorkerUrl("a-later-build"), {
        scope: "/",
        updateViaCache: "none",
      }),
    );
    // Registering the new URL is the update.
    expect(registration.update).not.toHaveBeenCalled();
  });

  it("says nothing when the version check fails, because that is just offline", async () => {
    const registration = fakeRegistration();
    const container = installContainer(registration, { fake: "controller" });
    render(<ServiceWorker />);
    await waitFor(() => expect(container.register).toHaveBeenCalled());

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    becomeVisible();

    await waitFor(() => expect(registration.update).toHaveBeenCalled());
    expect(toastInfo).not.toHaveBeenCalled();
    expect(container.register).toHaveBeenCalledTimes(1);
  });
});
