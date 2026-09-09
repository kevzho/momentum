"use client";

import * as React from "react";

import { persistSidebarState, type SidebarState } from "@/lib/sidebar-state";

interface SidebarContextValue {
  state: SidebarState;
  collapsed: boolean;
  toggle: () => void;
  /** The mobile drawer. Separate state: a phone has no collapsed rail. */
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

// Seeded from the cookie the server already read, so the first paint is the correct width.
export function SidebarProvider({
  defaultState,
  children,
}: {
  defaultState: SidebarState;
  children: React.ReactNode;
}) {
  const [state, setState] = React.useState<SidebarState>(defaultState);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const toggle = React.useCallback(() => {
    setState((current) => {
      const next: SidebarState = current === "collapsed" ? "expanded" : "collapsed";
      persistSidebarState(next);
      return next;
    });
  }, []);

  const value = React.useMemo<SidebarContextValue>(
    () => ({ state, collapsed: state === "collapsed", toggle, mobileOpen, setMobileOpen }),
    [state, toggle, mobileOpen],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar(): SidebarContextValue {
  const context = React.useContext(SidebarContext);
  if (!context) throw new Error("useSidebar must be used inside <SidebarProvider>");
  return context;
}
