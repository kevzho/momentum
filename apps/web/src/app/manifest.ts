import type { MetadataRoute } from "next";

import { APP_DESCRIPTION, APP_NAME, APP_SHORT_NAME, THEME_COLOR } from "@/lib/pwa/app-identity";

/**
 * Served at `/manifest.webmanifest`, and linked from `<head>` automatically
 * because this file exists.
 *
 * Static by construction — no request-time API is read — so it is generated
 * once at build and served from the CDN. That matters more than it looks: the
 * browser fetches the manifest *without credentials*, so anything per-request
 * here would be computed for a caller that has no session
 * (`proxy.ts` exempts this path for the same reason).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: APP_DESCRIPTION,

    /*
     * The product opens on Today, so the installed app does too — `/` only
     * redirects there. `scope` is the whole origin: every route belongs to the
     * app, which is also what makes a deep link to /calendar?week=… open in the
     * installed window instead of bouncing to the browser.
     */
    start_url: "/today",
    scope: "/",
    display: "standalone",
    /*
     * Ordered fallbacks for platforms that do not honour `display`.
     *
     * `browser` is deliberately absent: an installed window that quietly became
     * a tab is the failure this phase exists to avoid.
     *
     * So is `window-controls-overlay`, and for a sharper reason — declaring it
     * *turns it on*. Chrome then draws the window controls into the page's own
     * top strip, and a layout that has not reserved `env(titlebar-area-*)` gets
     * the traffic lights on top of its top bar. Momentum's frame assumes a
     * plain standalone window; the day it reserves that space is the day this
     * value belongs here.
     */
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    dir: "ltr",
    lang: "en",
    categories: ["productivity", "utilities"],

    /*
     * `background_color` paints the window before the first frame renders and
     * `theme_color` colours the OS chrome around it. Both are the *light*
     * theme's `--background`: a manifest has one value and no media query, and
     * light is the value a first-time installer with no stored preference is
     * most likely to land on. The live document's `<meta name="theme-color">`
     * follows the active theme from the first paint (components/theme-color.tsx);
     * this is only the splash.
     */
    background_color: THEME_COLOR.light,
    theme_color: THEME_COLOR.light,

    icons: [
      { src: "/icons/icon-96.png", sizes: "96x96", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      /*
       * Separate entries, never `purpose: "any maskable"` on one file: a
       * maskable icon has 10% of padding on every side that the platform crops,
       * so the same PNG used as `any` renders visibly small and floating.
       */
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
