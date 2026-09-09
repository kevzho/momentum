"use client";

import * as React from "react";

type Politeness = "polite" | "assertive";

type Announce = (message: string, politeness?: Politeness) => void;

const AnnouncerContext = React.createContext<Announce | null>(null);

/** For the toast API, which is not a component. Everything else uses the hook. */
let mounted: Announce | null = null;

function announceStandalone(message: string, politeness: Politeness = "polite"): void {
  mounted?.(message, politeness);
}

/** The single `aria-live` region for the whole application. Components never render their own. */
function AnnouncerProvider({ children }: { children: React.ReactNode }) {
  const [polite, setPolite] = React.useState("");
  const [assertive, setAssertive] = React.useState("");

  const announce = React.useCallback((message: string, politeness: Politeness = "polite") => {
    const set = politeness === "assertive" ? setAssertive : setPolite;
    // Clear first so repeating the same message is still announced.
    set("");
    requestAnimationFrame(() => set(message));
  }, []);

  React.useEffect(() => {
    mounted = announce;
    return () => {
      if (mounted === announce) mounted = null;
    };
  }, [announce]);

  return (
    <AnnouncerContext.Provider value={announce}>
      {children}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {polite}
      </div>
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {assertive}
      </div>
    </AnnouncerContext.Provider>
  );
}

/** `announce(message)` — a no-op outside a provider, never a thrown error. */
function useAnnounce(): Announce {
  const announce = React.useContext(AnnouncerContext);
  return announce ?? noop;
}

function noop() {}

export { AnnouncerProvider, announceStandalone, useAnnounce };
