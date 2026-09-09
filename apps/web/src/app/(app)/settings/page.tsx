import type { Metadata } from "next";

import { SettingsView } from "@/features/settings/components/settings-view";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Settings" };

/**
 * The page shell is a server component: it reads the profile once through the
 * cached session and hands the client island the values as they are stored.
 * Week start and snapping travel as numbers; the view turns them into words.
 */
export default async function SettingsPage() {
  const { profile, email } = await requireSession();

  return (
    <SettingsView
      defaults={{
        // An empty stored name shows the address, as the shell does; the field
        // writes only what the user types, so the fallback is never saved.
        displayName: profile.displayName || (email ?? ""),
        timezone: profile.timezone,
        weekStart: profile.weekStart,
        snapMinutes: profile.snapMinutes,
        workingHours: profile.workingHours,
        focusWindows: profile.focusWindows,
      }}
    />
  );
}
