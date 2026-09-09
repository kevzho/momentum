"use client";

import * as React from "react";

/**
 * Whether the viewer has asked for reduced motion.
 *
 * `globals.css` already collapses every transition and animation under
 * `prefers-reduced-motion: reduce`, and for ordinary interface motion that is
 * the whole answer. Celebration is the case where it is not: a level-up
 * flourish that merely runs in 0.01ms is still a burst of shapes appearing and
 * vanishing on screen. This hook lets the celebration decide not to render one
 * at all, which is what "suppresses celebration animation" has to mean
 * (specs/08-gamification.md, docs/DESIGN_SYSTEM.md).
 *
 * `useSyncExternalStore` rather than an effect that sets state: a media query
 * *is* an external store, and this is the shape React provides for reading one
 * without a render-then-correct pass. The server snapshot is `true` — motion
 * off — so nothing animates before the browser has answered.
 */
const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return noop;

  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** A boolean, so React's identity check settles rather than looping. */
function getSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return true;
}

function noop(): void {}

export function useReducedMotion(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
