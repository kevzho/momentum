/**
 * Sidebar collapse state lives in a cookie so the server renders the correct
 * width on the first paint. Reading it from `localStorage` after hydration
 * would flash the wrong layout, which is exactly what this phase's acceptance
 * criteria forbid for the theme and would look no better here.
 */
export const SIDEBAR_COOKIE = "momentum.sidebar";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export type SidebarState = "expanded" | "collapsed";

export function parseSidebarState(value: string | undefined): SidebarState {
  return value === "collapsed" ? "collapsed" : "expanded";
}

/** Client-side persistence. Same-site, not read by anything but the layout. */
export function persistSidebarState(state: SidebarState): void {
  document.cookie = `${SIDEBAR_COOKIE}=${state}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}
