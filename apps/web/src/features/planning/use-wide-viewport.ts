"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the viewport is at or past Tailwind's `lg` breakpoint. The server
 * snapshot is "wide": the server-rendered panel is already `hidden lg:flex`,
 * so a phone's first paint shows nothing either way.
 */
export function useWideViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// Tailwind v4's default `lg`.
const WIDE_QUERY = "(min-width: 64rem)";

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  // jsdom has no `matchMedia`.
  if (typeof window.matchMedia !== "function") return true;
  return window.matchMedia(WIDE_QUERY).matches;
}

function getServerSnapshot(): boolean {
  return true;
}
