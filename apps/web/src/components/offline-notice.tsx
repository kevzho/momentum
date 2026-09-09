"use client";

import { WifiOffIcon } from "lucide-react";

import { useOnlineStatus } from "@/lib/pwa/use-online-status";

/**
 * The standing "you are offline" line. A tab already loaded when the connection
 * dropped keeps rendering ordinary UI over data that may be stale, and
 * Momentum has no offline store or replay queue, so the wording promises no
 * later sync. A strip in each frame's flex column, not an overlay: at 393px an
 * overlay covered the top bar. Not dismissible; it disappears when the fact
 * stops being true.
 */
export function OfflineNotice() {
  const online = useOnlineStatus();

  return (
    // Rendered in both states: an `aria-live` region inserted with its message is
    // frequently not announced at all. Empty, it is a zero-height flex item.
    <div role="status" aria-live="polite" className="shrink-0 empty:hidden">
      {online ? null : (
        <p className="border-b bg-muted px-3 py-1.5 text-center text-xs text-muted-foreground">
          {/* `inline-flex` inside a centred block, not a flex row: when the sentence
              wraps, a flex row strands the icon at the far left. */}
          <span className="inline-flex items-start gap-1.5 text-left">
            <WifiOffIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span>Offline — this screen may be out of date, and changes will not save.</span>
          </span>
        </p>
      )}
    </div>
  );
}
