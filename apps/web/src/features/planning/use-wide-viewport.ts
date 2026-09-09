"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the viewport is at or past Tailwind's `lg` breakpoint — the width at
 * which the Plan panel has room beside the calendar. Below it the same content
 * is presented as a sheet over the calendar (docs/DESIGN_SYSTEM.md: `SideSheet`
 * is the below-`lg` form of `SidePanel`).
 *
 * `useSyncExternalStore` rather than an effect, and the server snapshot is
 * "wide": the server-rendered panel is already `hidden lg:flex`, so a phone's
 * first paint shows nothing either way, and a desktop's first paint shows the
 * panel without waiting a frame for the client to measure. The client's own
 * answer replaces the guess on hydration.
 */
export function useWideViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Tailwind v4's default `lg`, which nothing in the design system overrides. */
const WIDE_QUERY = "(min-width: 64rem)";

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  // jsdom has no `matchMedia`; a test renders the panel the way the server does.
  if (typeof window.matchMedia !== "function") return true;
  return window.matchMedia(WIDE_QUERY).matches;
}

function getServerSnapshot(): boolean {
  return true;
}
