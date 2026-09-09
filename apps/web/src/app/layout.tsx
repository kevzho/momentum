import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "@momentum/ui/globals.css";

import { AnnouncerProvider } from "@momentum/ui/components/announcer";
import { Toaster } from "@momentum/ui/components/toast";
import { TooltipProvider } from "@momentum/ui/components/tooltip";

import { ServiceWorker } from "@/components/service-worker";
import { ThemeColor } from "@/components/theme-color";
import { ThemeProvider } from "@/components/theme-provider";
import { APP_DESCRIPTION, APP_NAME, THEME_COLOR } from "@/lib/pwa/app-identity";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  /*
   * `app/manifest.ts` already causes Next to emit `<link rel="manifest">`; the
   * icons below are the ones no manifest covers. iOS reads `apple-touch-icon`
   * and nothing else when the user taps "Add to Home Screen".
   */
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    /*
     * The iOS half of installability. Safari has no manifest `display`
     * handling: this is what makes a home-screen launch open without browser
     * chrome, and it must agree with the manifest's `display: "standalone"`.
     */
    capable: true,
    title: APP_NAME,
    /*
     * `black-translucent` extends the page under the status bar, which is the
     * only way `env(safe-area-inset-top)` reports a non-zero value. It is
     * therefore paired with `viewportFit: "cover"` below and with the
     * safe-area padding in the shell — all three, or the clock sits on top of
     * the top bar.
     */
    statusBarStyle: "black-translucent",
  },
  /*
   * `appleWebApp` above emits the standard `mobile-web-app-capable`, which
   * current iOS honours. This is the older spelling of the same switch, and it
   * is what versions before it read: without it, "Add to Home Screen" on an
   * older iPhone launches Momentum inside Safari's chrome, which is the one
   * thing this phase is for. Two tags, one meaning, and the deprecated one
   * costs nothing.
   */
  other: { "apple-mobile-web-app-capable": "yes" },
  /*
   * Momentum is behind a login and has nothing to offer a crawler; the
   * marketing surface, if there ever is one, will be its own deployment.
   */
  robots: { index: false, follow: false },
};

/**
 * `themeColor` colours the browser and OS chrome around the page. It is a meta
 * tag, so it cannot reference a CSS variable: `THEME_COLOR` holds the sRGB
 * values of `--background` in each theme, and they are kept in step with
 * `packages/ui/src/styles/globals.css` by hand.
 *
 * These two media-scoped tags are the *first paint*, which is all a static tag
 * can be — they follow the operating system, which is right for the default
 * (`system`) theme and wrong for a user who has chosen the other one.
 * `<ThemeColor />` rewrites them once next-themes has resolved which theme is
 * actually on screen.
 *
 * `viewportFit: "cover"` lets the page paint into the display cutout and home
 * indicator areas on iOS. It is what makes `env(safe-area-inset-*)` meaningful,
 * and every edge of the shell pays it back as padding.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
  ],
};

/**
 * `suppressHydrationWarning` is here and nowhere else: `next-themes` writes the
 * theme class onto `<html>` from a blocking script before React hydrates, which
 * is what removes the flash of the wrong theme (docs/ARCHITECTURE.md §10).
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ThemeProvider>
          <TooltipProvider delayDuration={300}>
            <AnnouncerProvider>
              {children}
              <Toaster />
              {/* Two mount-once, render-nothing islands. They are in the root
                  layout rather than the app shell because they are true of the
                  sign-in screens too: an install can begin there, and a theme
                  is chosen there. `<OfflineNotice />` is *not* here — it draws
                  a strip, so it belongs inside each frame's column rather than
                  floating over one. */}
              <ThemeColor />
              <ServiceWorker />
            </AnnouncerProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
