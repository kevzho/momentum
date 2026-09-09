"use client";

import { useEffect } from "react";

import { toast } from "@momentum/ui/components/toast";

import {
  BUILD_VERSION,
  SERVICE_WORKER_URL,
  VERSION_ENDPOINT,
  serviceWorkerUrl,
} from "@/lib/pwa/build-version";
import { reportError } from "@/lib/report-error";

/**
 * Registers the service worker and owns its update path.
 *
 * `public/sw.js` is byte-identical across builds, so the script URL carries the
 * build (`/sw.js?v=<build>`) and `updateViaCache: "none"` keeps the browser from
 * answering that fetch from cache. A waiting worker never activates on its own:
 * the user is prompted, and `controllerchange` reloads exactly once, only for an
 * update. A long-lived tab polls `/version` because `registration.update()`
 * re-fetches the URL it was registered under and would answer "unchanged"
 * forever; a soft navigation never fetches a document either.
 *
 * In development nothing is registered and anything registered is torn down: a
 * worker caching `/_next/static` across HMR builds produces bugs that look like
 * the application's.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => registrations.map((registration) => registration.unregister()));
      return;
    }

    let cancelled = false;
    let reloading = false;

    // `controllerchange` also fires when the first worker claims a page that
    // loaded uncontrolled; that is not an update and must not reload.
    const hadController = Boolean(navigator.serviceWorker.controller);

    const onControllerChange = () => {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const cleanups: Array<() => void> = [
      () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange),
    ];

    void navigator.serviceWorker
      .register(SERVICE_WORKER_URL, { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        if (cancelled) return;

        // `waiting` is already set when a worker installed on a previous visit
        // and the tab was closed before reloading.
        if (registration.waiting && navigator.serviceWorker.controller) {
          promptToUpdate(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;

          installing.addEventListener("statechange", () => {
            // `installed` with no controller is the very first install: nothing
            // stale to replace.
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              promptToUpdate(installing);
            }
          });
        });

        const checkForUpdate = async () => {
          try {
            const response = await fetch(VERSION_ENDPOINT, { cache: "no-store" });
            if (response.ok) {
              const body: unknown = await response.json();
              const deployed =
                typeof body === "object" && body !== null && "version" in body
                  ? body.version
                  : undefined;

              if (typeof deployed === "string" && deployed !== BUILD_VERSION) {
                // Registering the new build's URL is the only thing that makes
                // the browser fetch a worker again; the bytes at the old URL
                // have not changed. `updatefound` and the prompt follow.
                await navigator.serviceWorker.register(serviceWorkerUrl(deployed), {
                  scope: "/",
                  updateViaCache: "none",
                });
                return;
              }
            }
          } catch {
            // Offline or server down; a failed poll is not shown to the user.
          }

          await registration.update().catch(() => {});
        };

        const poll = () => void checkForUpdate();

        const onVisible = () => {
          if (document.visibilityState === "visible") poll();
        };

        document.addEventListener("visibilitychange", onVisible);
        const interval = window.setInterval(poll, UPDATE_POLL_MS);

        cleanups.push(() => {
          document.removeEventListener("visibilitychange", onVisible);
          window.clearInterval(interval);
        });
      })
      .catch((thrown) => {
        // Fails on insecure origins, blocked storage, some private windows. The
        // app works without a worker, so this is reported, not shown.
        reportError(thrown, { source: "ServiceWorker.register" });
      });

    return () => {
      cancelled = true;
      for (const cleanup of cleanups) cleanup();
    };
  }, []);

  return null;
}

const UPDATE_POLL_MS = 60 * 60 * 1000;

/** Never auto-applied: activating the waiting worker reloads the page. */
function promptToUpdate(waiting: ServiceWorker): void {
  toast.info("A new version of Momentum is ready.", {
    duration: Infinity,
    action: {
      label: "Reload",
      onClick: () => {
        // The worker calls `skipWaiting()`; the `controllerchange` listener reloads.
        waiting.postMessage({ type: "SKIP_WAITING" });
      },
    },
  });
}
