import type { Route } from "next";
import {
  CalendarDaysIcon,
  ChartNoAxesColumnIcon,
  ListTodoIcon,
  RepeatIcon,
  SettingsIcon,
  SunriseIcon,
  TimerIcon,
  TrophyIcon,
  type LucideIcon,
} from "lucide-react";

/**
 * The navigation registry. One list, used by the sidebar, the mobile drawer and
 * the top bar's section name, so a route can never appear in one and not the
 * others. `href` is a typed route: a link to a page that does not exist is a
 * compile error.
 */
export interface NavItem {
  href: Route;
  label: string;
  icon: LucideIcon;
}

export const PRIMARY_NAV: readonly NavItem[] = [
  { href: "/today", label: "Today", icon: SunriseIcon },
  { href: "/calendar", label: "Calendar", icon: CalendarDaysIcon },
  { href: "/tasks", label: "Tasks", icon: ListTodoIcon },
  { href: "/habits", label: "Habits", icon: RepeatIcon },
  { href: "/focus", label: "Focus", icon: TimerIcon },
  { href: "/progress", label: "Progress", icon: TrophyIcon },
  { href: "/analytics", label: "Analytics", icon: ChartNoAxesColumnIcon },
];

export const SETTINGS_NAV: NavItem = {
  href: "/settings",
  label: "Settings",
  icon: SettingsIcon,
};

const ALL_NAV: readonly NavItem[] = [...PRIMARY_NAV, SETTINGS_NAV];

/**
 * The section a pathname belongs to. Used only for the top bar's mobile
 * section name — the page's own `PageHeader` owns the title everywhere else.
 */
export function sectionLabel(pathname: string): string | null {
  const match = ALL_NAV.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  return match?.label ?? null;
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Every route a signed-in user may be sent back to after authenticating.
 *
 * Two jobs at once. It keeps `?next=` from becoming an open redirect — only a
 * path in this list is ever followed — and it keeps the value a *typed* route,
 * so a destination that no longer exists is a compile error rather than a 404
 * after sign-in. Query strings are deliberately dropped: the parameter exists
 * to return someone to a page, not to carry state through a login.
 */
const RETURNABLE_ROUTES: readonly Route[] = [
  ...PRIMARY_NAV.map((item) => item.href),
  SETTINGS_NAV.href,
];

export function returnableRoute(value: string | null | undefined): Route | null {
  if (typeof value !== "string" || !value.startsWith("/")) return null;
  const path = value.split(/[?#]/)[0];
  return RETURNABLE_ROUTES.find((route) => route === path) ?? null;
}
