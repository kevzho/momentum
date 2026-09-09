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
 * The rule the whole file serves: **never strand the user on an old version.**
 * Four things follow from it.
 *
 * 1. **The script URL carries the build.** `/sw.js?v=<build>` changes every
 *    deploy, so `register()` always has a new script to install even though
 *    `public/sw.js` is byte-identical. `updateViaCache: "none"` stops the
 *    browser answering that fetch from its HTTP cache.
 * 2. **The waiting worker never activates on its own.** It would swap the
 *    worker out from under a bundle that is mid-session. Instead the user is
 *    told, and asks for it.
 * 3. **`controllerchange` reloads exactly once, and only for an update.** Once
 *    the new worker is in control, the page it controls has to be re-fetched or
 *    it is the old bundle under a new worker — the precise failure this phase
 *    is about. It fires for a second reason too: the first worker claiming a
 *    page that loaded uncontrolled, which is not an update and must not reload
 *    anything. `hadController` separates the two, `reloading` stops the second
 *    one.
 * 4. **A long-lived tab asks the server what build it is serving.** This is the
 *    subtle one. `registration.update()` re-fetches the URL the worker was
 *    registered under, and `public/sw.js` is byte-identical across builds — so
 *    for a tab loaded before a deploy, that request answers "unchanged" no
 *    matter how many deploys have happened. Nor does the client router rescue
 *    it: a soft navigation fetches an RSC payload, never a document, so the
 *    page can keep running the bundle it was loaded with for as long as it is
 *    open. The check therefore reads `/version`, and when the server names a
 *    different build it registers *that* build's worker URL, which is what
 *    starts the prompt above. `update()` is still called when the versions
 *    agree, to catch a changed `sw.js` at the same version.
 *
 * In development nothing is registered and anything already registered is torn
 * down: a worker caching `/_next/static` across HMR builds produces bugs that
 * look like the application's and are not.
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

    /*
     * Whether this page was already under a worker when it loaded.
     *
     * `controllerchange` fires for two different events. One is an update
     * taking over, which has to reload. The other is the *first* worker
     * claiming a page that loaded uncontrolled — on a first visit, on the very
     * first deploy — where the page is already running the current bundle and
     * a reload would be a gratuitous flash on someone's first impression of the
     * product. The distinction is exactly this flag.
     */
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

        /*
         * `waiting` is already set when a new worker installed during a
         * previous visit and the user closed the tab before reloading. Without
         * this line they would be offered the update only if another deploy
         * happened to land while they watched.
         */
        if (registration.waiting && navigator.serviceWorker.controller) {
          promptToUpdate(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;

          installing.addEventListener("statechange", () => {
            /*
             * `installed` *with* a controller means an update: there was an old
             * worker, and this one is queued behind it. `installed` with no
             * controller is the very first install — nothing to announce, and
             * nothing stale to replace.
             */
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
                /*
                 * The server has moved on. Registering the new build's script
                 * URL is what the *new* build's page would do on load, and it
                 * is the only thing that makes the browser fetch and install a
                 * worker again — the bytes at the old URL have not changed.
                 * From here the ordinary path takes over: `updatefound`, the
                 * prompt, and a reload that lands on the new bundle.
                 */
                await navigator.serviceWorker.register(serviceWorkerUrl(deployed), {
                  scope: "/",
                  updateViaCache: "none",
                });
                return;
              }
            }
          } catch {
            // Offline, or the server is down. The next check will find out;
            // a failed poll is not something to tell the user about.
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
        /*
         * Registration fails on an insecure origin, with storage blocked, or in
         * a private window on some browsers. The application works without a
         * worker — it just loses the offline page — so this is reported and not
         * shown: a toast here would be an error message about a feature the
         * user never asked for.
         */
        reportError(thrown, { source: "ServiceWorker.register" });
      });

    return () => {
      cancelled = true;
      for (const cleanup of cleanups) cleanup();
    };
  }, []);

  return null;
}

/** Long enough not to be chatty, short enough that a tab left open overnight
 *  is never a day behind. */
const UPDATE_POLL_MS = 60 * 60 * 1000;

/**
 * The one moment the user is asked about any of this.
 *
 * Not auto-applied: activating the waiting worker reloads the page, and
 * reloading someone mid-drag or mid-focus-session to deliver a build they did
 * not know was coming is worse than the delay. The toast does not auto-dismiss,
 * so the offer stays until it is taken or dismissed.
 */
function promptToUpdate(waiting: ServiceWorker): void {
  toast.info("A new version of Momentum is ready.", {
    duration: Infinity,
    action: {
      label: "Reload",
      onClick: () => {
        // The worker calls `skipWaiting()`, takes control, and the
        // `controllerchange` listener above reloads the page onto the new build.
        waiting.postMessage({ type: "SKIP_WAITING" });
      },
    },
  });
}
