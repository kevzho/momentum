"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the browser believes it has a network connection.
 *
 * `navigator.onLine` is only trustworthy in one direction — `false` reliably
 * means "no network", while `true` means "an interface is up", which is not the
 * same as "the server is reachable". Everything built on this hook is therefore
 * *informational*: it explains a state the user is already in. It never gates a
 * mutation, because the authority on whether a write reached the server is the
 * write (docs/ARCHITECTURE.md §8) — a pre-flight check here would add a second
 * way to fail and a new way to be wrong.
 *
 * `useSyncExternalStore` rather than an effect: the server snapshot is `true`,
 * so the markup React renders on the server and the markup it hydrates with
 * match, and the offline state appears on the first client render instead of a
 * frame later.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

/** The server cannot know, and rendering "offline" to a request that arrived
 *  over the network would be absurd. */
function getServerSnapshot(): boolean {
  return true;
}
