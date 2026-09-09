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
  // `app/manifest.ts` emits `<link rel="manifest">`; these are the icons no
  // manifest covers. iOS reads only `apple-touch-icon`.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    // Safari ignores the manifest's `display`; this must agree with its `standalone`.
    capable: true,
    title: APP_NAME,
    // The only way `env(safe-area-inset-top)` is non-zero; paired with
    // `viewportFit: "cover"` and the shell's safe-area padding, or the clock
    // sits on the top bar.
    statusBarStyle: "black-translucent",
  },
  // The older spelling of `mobile-web-app-capable`, still read by older iOS.
  other: { "apple-mobile-web-app-capable": "yes" },
  robots: { index: false, follow: false },
};

// `themeColor` cannot reference a CSS variable: `THEME_COLOR` holds the sRGB
// values of `--background`, kept in step with `packages/ui/src/styles/globals.css`
// by hand. These media-scoped tags are the first paint only; `<ThemeColor />`
// rewrites them once next-themes has resolved the theme.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
  ],
};

// `suppressHydrationWarning`: next-themes writes the theme class onto `<html>`
// from a blocking script before React hydrates.
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
              {/* In the root layout, not the app shell: both apply to the sign-in screens too. */}
              <ThemeColor />
              <ServiceWorker />
            </AnnouncerProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
