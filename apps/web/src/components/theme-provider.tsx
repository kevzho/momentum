"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// `next-themes` writes the class on `<html>` from a blocking inline script,
// which is why `<html>` carries `suppressHydrationWarning`.
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
