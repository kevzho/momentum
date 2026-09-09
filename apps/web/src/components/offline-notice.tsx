"use client";

import { WifiOffIcon } from "lucide-react";

import { useOnlineStatus } from "@/lib/pwa/use-online-status";

/**
 * The standing "you are offline" line.
 *
 * It exists because of a gap that is easy to miss: the offline *page* only
 * appears when a navigation fails, and a tab that was already loaded when the
 * connection dropped keeps rendering perfectly ordinary UI over data that may
 * be minutes old. Without this, "cached read data may be displayed" (specs/12)
 * would be displayed with nothing marking it as potentially stale.
 *
 * The wording is the honest one. Momentum has no offline store and no replay
 * queue, so the two things a user needs to know are that the screen may be out
 * of date and that a change will not save — not a reassuring "we'll sync
 * later", which would be a claim of a capability the app does not have.
 *
 * **A strip in the layout, not an overlay.** The first version of this floated
 * at the top of the viewport so that one mount in the root layout could serve
 * every route. At 393px it covered the top bar outright — the level indicator
 * and the navigation trigger disappeared behind a two-line pill. `pointer-
 * events-none` meant the controls could still be *clicked*, which is worse
 * than useless when they cannot be *seen*. A frame that is exactly `h-dvh`
 * with one scrolling child has no space to lend an overlay, so the honest
 * shape is a strip that takes its own: both frames are flex columns, so the
 * row costs `<main>` its height and nothing else, only while it is true. The
 * price is two mount points instead of one, which is the right trade.
 *
 * It is not dismissible: it disappears when the fact it reports stops being
 * true.
 */
export function OfflineNotice() {
  const online = useOnlineStatus();

  return (
    /*
     * Rendered in both states so that the live region exists in the DOM before
     * it has anything to say — an `aria-live` region that is inserted *with* its
     * message is frequently not announced at all. Empty, it is a zero-height
     * flex item and costs the layout nothing.
     */
    <div role="status" aria-live="polite" className="shrink-0 empty:hidden">
      {online ? null : (
        <p className="border-b bg-muted px-3 py-1.5 text-center text-xs text-muted-foreground">
          {/* An `inline-flex` group inside a centred block, rather than a flex
              row: below about 420px the sentence wraps, and a flex row would
              leave the icon stranded at the far left, vertically centred
              against two lines of text it no longer sits beside. This keeps
              the icon against the first word at every width. */}
          <span className="inline-flex items-start gap-1.5 text-left">
            <WifiOffIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span>Offline — this screen may be out of date, and changes will not save.</span>
          </span>
        </p>
      )}
    </div>
  );
}
