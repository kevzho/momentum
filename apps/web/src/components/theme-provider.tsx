"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Light and dark are both first-class, system preference is the default, and a
 * chosen theme persists. `next-themes` writes the class on `<html>` from a
 * blocking inline script, so there is never a frame of the wrong theme — which
 * is why `<html>` carries `suppressHydrationWarning`.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
