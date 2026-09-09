"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the browser believes it has a network connection. `navigator.onLine`
 * is only trustworthy when `false`, so this is informational and never gates a
 * mutation: the authority on whether a write reached the server is the write.
 * `useSyncExternalStore` with a server snapshot of `true`, so server and
 * hydration markup match.
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

function getServerSnapshot(): boolean {
  return true;
}
