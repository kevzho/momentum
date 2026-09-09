"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";

import { THEME_COLOR } from "@/lib/pwa/app-identity";

/**
 * Keeps `<meta name="theme-color">` on the theme the user is actually looking
 * at.
 *
 * The static tags in `app/layout.tsx` are media-scoped — one for
 * `prefers-color-scheme: light`, one for dark — which is exactly right for the
 * default (`system`) and exactly wrong the moment someone chooses a theme that
 * differs from their OS. On a phone, or in an installed window with a title
 * bar, that shows up as a strip of the wrong colour above the app.
 *
 * So this rewrites the *content* of both tags rather than appending a third:
 * the browser uses the first `theme-color` whose media query matches, so a
 * media-less tag added at the end would lose to a matching one above it.
 * Setting both to the resolved colour makes the media query irrelevant, which
 * is the point — once a theme is resolved, there is nothing left to branch on.
 *
 * The static tags still carry the first paint, before any of this runs.
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
