"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";

import { THEME_COLOR } from "@/lib/pwa/app-identity";

/**
 * Keeps `<meta name="theme-color">` on the theme actually on screen. The
 * static tags in `app/layout.tsx` are media-scoped and wrong the moment a user
 * chooses a theme that differs from their OS. Both tags' content is rewritten
 * rather than a third appended: the browser uses the first tag whose media
 * query matches, so a media-less tag at the end would lose.
 */
export function ThemeColor() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    // `undefined` until next-themes has read storage and the media query.
    if (resolvedTheme !== "light" && resolvedTheme !== "dark") return;

    const color = THEME_COLOR[resolvedTheme];
    for (const meta of Array.from(document.querySelectorAll('meta[name="theme-color"]'))) {
      meta.setAttribute("content", color);
    }
  }, [resolvedTheme]);

  return null;
}
