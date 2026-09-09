"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * `false` while rendering on the server and during hydration, `true` after.
 *
 * The hook for anything whose correct value only exists in the browser — a
 * stored theme, a media query, the current time. Rendering the browser value
 * before hydration would be a mismatch; rendering a guess would be wrong, so
 * components render a neutral state until this returns `true`
 * (docs/ARCHITECTURE.md §10).
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
