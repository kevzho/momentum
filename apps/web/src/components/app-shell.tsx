import { ProgressProvider } from "@/features/gamification/components/progress-provider";
import type { ProgressBadge } from "@/features/gamification/types";
import { PaletteProvider } from "@/features/palette/components/palette-provider";
import { QuickAddProvider } from "@/features/tasks/components/quick-add";
import type { ProjectSummaryWithCount, TaskSummary } from "@/features/tasks/types";
import { OfflineNotice } from "@/components/offline-notice";
import { SidebarProvider } from "@/components/sidebar-context";
import { Sidebar } from "@/components/sidebar";
import { TopBar, type Account } from "@/components/top-bar";
import type { LocalDate } from "@momentum/core/types";
import type { SidebarState } from "@/lib/sidebar-state";
import { UserSettingsProvider, type UserSettings } from "@/lib/time/user-settings";

/**
 * The logged-in frame: a server component; only the pieces that need browser
 * state are client islands. The frame is exactly the viewport height and only
 * `<main>` scrolls.
 */
export function AppShell({
  sidebarState,
  settings,
  account,
  progress,
  projects,
  tasks,
  today,
  newTaskSortOrder,
  children,
}: {
  sidebarState: SidebarState;
  settings: UserSettings;
  account: Account;
  // Read here rather than on the progress page because both the top bar's
  // indicator and the celebration live in the frame.
  progress: ProgressBadge;
  projects: readonly ProjectSummaryWithCount[];
  /** Every open task, as the command palette's search index. */
  tasks: readonly TaskSummary[];
  /** Today in the profile timezone, resolved once per request. */
  today: LocalDate;
  // One step below the user's lowest row, so a capture lands first in the Inbox
  // instead of tying with every other capture at 0.
  newTaskSortOrder: number;
  children: React.ReactNode;
}) {
  return (
    <UserSettingsProvider settings={settings}>
      <SidebarProvider defaultState={sidebarState}>
        {/* Mounted once, in the frame, so Quick Add is the same keystrokes on every route. */}
        <QuickAddProvider
          projects={projects}
          today={today}
          weekStart={settings.weekStart}
          newTaskSortOrder={newTaskSortOrder}
        >
          {/* Inside Quick Add, because "Add task" is a palette command that opens it. */}
          <PaletteProvider projects={projects} tasks={tasks} today={today}>
            <ProgressProvider badge={progress} />
            {/* Skip link past the navigation stops. Visible only when focused. */}
            <a
              href="#main-content"
              className="sr-only rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-toast"
            >
              Skip to content
            </a>
            {/* `safe-frame` and `safe-scroll-bottom` give back the space `viewport-fit=cover`
                paints under (iOS status bar and home indicator). `h-dvh` still measures the
                whole viewport, so the frame is exactly the window and only `<main>` scrolls. */}
            <div className="flex h-dvh w-full overflow-hidden safe-frame">
              <Sidebar account={account} projects={projects} />
              <div className="flex min-w-0 flex-1 flex-col">
                {/* Above the top bar, in the column, so going offline costs `<main>` a row and covers no control. */}
                <OfflineNotice />
                <TopBar account={account} progress={progress} projects={projects} />
                <main
                  id="main-content"
                  tabIndex={-1}
                  className="min-h-0 flex-1 safe-scroll-bottom overflow-y-auto"
                >
                  {children}
                </main>
              </div>
            </div>
          </PaletteProvider>
        </QuickAddProvider>
      </SidebarProvider>
    </UserSettingsProvider>
  );
}
