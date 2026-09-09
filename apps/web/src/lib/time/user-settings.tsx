"use client";

import { createContext, use } from "react";

import type { IanaTimeZone, SnapMinutes, Weekday } from "@momentum/core/types";

/**
 * The profile values client components need to render dates: seeded by the
 * server, never read from the browser. Reading
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` instead would render a
 * different "today" from the server on any device whose clock disagrees.
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
