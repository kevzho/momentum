"use client";

import * as React from "react";

import { reportError } from "@/lib/report-error";

/**
 * The last boundary. It replaces the whole document — `<html>` included — so the
 * stylesheet, the theme class and every provider are gone by the time it
 * renders. That is why this is the one file with inline literal colours: they
 * are the sRGB values of `--background`, `--foreground` and `--border` in the
 * light theme, and there is no token layer left to read them from.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => reportError(error, { boundary: "global" }), [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#fdfdfe",
          color: "#161a1f",
        }}
      >
        <main style={{ display: "grid", gap: 12, justifyItems: "center", padding: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Momentum stopped responding</h1>
          <p style={{ fontSize: 14, margin: 0, opacity: 0.7 }}>
            The application hit an unexpected error and could not recover on its own.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 8,
              padding: "6px 12px",
              fontSize: 14,
              borderRadius: 8,
              border: "1px solid #e1e3e6",
              background: "#ffffff",
              cursor: "pointer",
            }}
          >
            Reload the application
          </button>
        </main>
      </body>
    </html>
  );
}
