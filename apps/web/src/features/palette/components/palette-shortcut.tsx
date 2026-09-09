"use client";

import * as React from "react";

import { Kbd } from "@momentum/ui/components/kbd";

/**
 * The palette's shortcut, spelled the way this keyboard spells it: ⌘K on a Mac,
 * Ctrl K everywhere else (specs/11-command-palette.md). Both are bound; only
 * the hint has to choose.
 *
 * `useSyncExternalStore` rather than an effect. The server has no keyboard to
 * ask about, so it renders the Mac form and the client corrects it during
 * hydration — with no state written from an effect, and no markup mismatch,
 * because React is told outright that the two snapshots differ
 * (docs/ARCHITECTURE.md §10, the same reason `useNow` is shaped this way).
 */
export function PaletteShortcut({ className }: { className?: string }) {
  const apple = React.useSyncExternalStore(subscribe, isApplePlatform, serverSnapshot);
  return <Kbd className={className}>{apple ? "⌘K" : "Ctrl K"}</Kbd>;
}

/** The platform does not change while the page is open; there is nothing to watch. */
function subscribe(): () => void {
  return () => {};
}

function serverSnapshot(): boolean {
  return true;
}

function isApplePlatform(): boolean {
  const platform =
    // `userAgentData` is the non-deprecated source where it exists.
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform;
  return /mac|iphone|ipad|ipod/i.test(platform);
}
