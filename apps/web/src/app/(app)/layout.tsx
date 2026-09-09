import { cookies } from "next/headers";

import { AppShell } from "@/components/app-shell";
import { getProgressBadge } from "@/features/gamification/queries";
import { getShellTaskData } from "@/features/tasks/queries";
import { requireSession } from "@/lib/auth/session";
import { SIDEBAR_COOKIE, parseSidebarState } from "@/lib/sidebar-state";

// `requireSession()` is the real gate; `proxy.ts` is an optimisation. It is
// `cache()`d, so the pages below re-use the same session and profile.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [session, cookieStore, shell, progress] = await Promise.all([
    requireSession(),
    cookies(),
    // Read once here so the sidebar, Quick Add and the palette work on every route.
    getShellTaskData(),
    // The top bar's level indicator and the celebration's baseline.
    getProgressBadge(),
  ]);
  const sidebarState = parseSidebarState(cookieStore.get(SIDEBAR_COOKIE)?.value);
  const { profile, email } = session;

  return (
    <AppShell
      sidebarState={sidebarState}
      settings={{
        timezone: profile.timezone,
        weekStart: profile.weekStart,
        snapMinutes: profile.snapMinutes,
      }}
      account={{
        displayName: profile.displayName || (email ?? "Your account"),
        email,
        initials: initialsFor(profile.displayName, email),
      }}
      progress={progress}
      projects={shell.projects}
      tasks={shell.tasks}
      today={shell.today}
      newTaskSortOrder={shell.newTaskSortOrder}
    >
      {children}
    </AppShell>
  );
}

/** Two letters at most, from the display name if there is one, otherwise the address. */
function initialsFor(displayName: string, email: string | null): string {
  const source = displayName.trim() || (email ?? "").split("@")[0] || "?";
  const words = source.split(/[\s._-]+/).filter(Boolean);
  const letters =
    words.length > 1 ? `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}` : source.slice(0, 2);
  return letters.toUpperCase();
}
