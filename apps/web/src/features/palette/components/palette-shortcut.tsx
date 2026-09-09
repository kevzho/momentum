"use client";

import * as React from "react";

import { Kbd } from "@momentum/ui/components/kbd";

// `useSyncExternalStore` rather than an effect: the server renders the Mac
// form and React reconciles the client snapshot without a hydration mismatch.
export function PaletteShortcut({ className }: { className?: string }) {
  const apple = React.useSyncExternalStore(subscribe, isApplePlatform, serverSnapshot);
  return <Kbd className={className}>{apple ? "⌘K" : "Ctrl K"}</Kbd>;
}

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
