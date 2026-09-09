import type { MetadataRoute } from "next";

import { APP_DESCRIPTION, APP_NAME, APP_SHORT_NAME, THEME_COLOR } from "@/lib/pwa/app-identity";

/**
 * Static by construction: the browser fetches the manifest without
 * credentials, so anything per-request here would run for a caller with no
 * session (`proxy.ts` exempts this path for the same reason).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: APP_DESCRIPTION,

    // `scope` is the whole origin, so a deep link opens in the installed window.
    start_url: "/today",
    scope: "/",
    display: "standalone",
    // `browser` is deliberately absent. So is `window-controls-overlay`: declaring
    // it turns it on, and the layout has not reserved `env(titlebar-area-*)`.
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    dir: "ltr",
    lang: "en",
    categories: ["productivity", "utilities"],

    // A manifest has one value and no media query; this is only the splash. The
    // live `<meta name="theme-color">` follows the active theme (components/theme-color.tsx).
    background_color: THEME_COLOR.light,
    theme_color: THEME_COLOR.light,

    icons: [
      { src: "/icons/icon-96.png", sizes: "96x96", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Never `purpose: "any maskable"` on one file: a maskable icon carries 10%
      // padding the platform crops, so as `any` it renders small and floating.
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
