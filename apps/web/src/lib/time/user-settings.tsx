"use client";

import { createContext, use } from "react";

import type { IanaTimeZone, SnapMinutes, Weekday } from "@momentum/core/types";

/**
 * The three profile values client components need to render dates correctly:
 * the timezone every boundary resolves in, the week start, and the calendar's
 * snapping increment (Domain Rule 4, docs/ARCHITECTURE.md §10).
 *
 * They are seeded by the server from `requireSession()`, never read from the
 * browser. A client component that reached for
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` instead would render a
 * different "today" from the server on any device whose clock disagrees with
 * the profile.
 */
export interface UserSettings {
  timezone: IanaTimeZone;
  weekStart: Weekday;
  snapMinutes: SnapMinutes;
}

const UserSettingsContext = createContext<UserSettings | null>(null);

export function UserSettingsProvider({
  settings,
  children,
}: {
  settings: UserSettings;
  children: React.ReactNode;
}) {
  return <UserSettingsContext value={settings}>{children}</UserSettingsContext>;
}

export function useUserSettings(): UserSettings {
  const settings = use(UserSettingsContext);
  if (!settings) {
    throw new Error("useUserSettings must be used inside the authenticated shell.");
  }
  return settings;
}
