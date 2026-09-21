import type { Route } from "next";
import {
  CalendarDaysIcon,
  ChartNoAxesColumnIcon,
  GraduationCapIcon,
  ListTodoIcon,
  RepeatIcon,
  SettingsIcon,
  SunriseIcon,
  TimerIcon,
  TrophyIcon,
  type LucideIcon,
} from "lucide-react";

/**
 * The navigation registry: one list for the sidebar, the mobile drawer and the
 * top bar's section name. `href` is a typed route.
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
  { href: "/courses", label: "Courses", icon: GraduationCapIcon },
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

/** The section a pathname belongs to, for the top bar's mobile section name. */
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
 * Every route a signed-in user may be sent back to after authenticating. Keeps
 * `?next=` from becoming an open redirect: only a path in this list is ever
 * followed, and query strings are dropped.
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
