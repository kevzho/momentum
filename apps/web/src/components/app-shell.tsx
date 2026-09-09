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
 * The logged-in application frame: a persistent rail, a top bar, and the
 * routed view. The shell itself is a server component — only the pieces that
 * need browser state (collapse, active route, menus) are client islands
 * (docs/ARCHITECTURE.md §5).
 *
 * The whole frame is exactly the viewport height and only `<main>` scrolls, so
 * the calendar's own scrolling surfaces behave the same on every route.
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
  /**
   * Level, XP, coins and unlocks, read once per request. It is here rather than
   * on the progress page because both things that use it are here: the top
   * bar's indicator, and the celebration — a level earned on /tasks has to be
   * noticed on /tasks.
   */
  progress: ProgressBadge;
  /** The user's projects: the sidebar's list, Quick Add's picker, the palette's. */
  projects: readonly ProjectSummaryWithCount[];
  /** Every open task, as the command palette's search index (Phase 11). */
  tasks: readonly TaskSummary[];
  /** Today in the profile timezone, resolved once per request (Domain Rule 4). */
  today: LocalDate;
  /**
   * The sort order Quick Add creates with: one step below the user's lowest
   * row, so a capture lands first in the Inbox instead of tying with every
   * other capture at 0 (Phase 13, AUTH-01).
   */
  newTaskSortOrder: number;
  children: React.ReactNode;
}) {
  return (
    <UserSettingsProvider settings={settings}>
      <SidebarProvider defaultState={sidebarState}>
        {/* Mounted once, in the frame, so Quick Add is the same two keystrokes
            on every route — which is what "from anywhere in-app" means. */}
        <QuickAddProvider
          projects={projects}
          today={today}
          weekStart={settings.weekStart}
          newTaskSortOrder={newTaskSortOrder}
        >
          {/* Inside Quick Add, because "Add task" is a palette command that
              opens it — and mounted in the frame for the same reason Quick Add
              is: ⌘K has to be the same two keystrokes on every route. */}
          <PaletteProvider projects={projects} tasks={tasks} today={today}>
            <ProgressProvider badge={progress} />
            {/* Seventeen navigation stops sit before the content; a keyboard user
            gets past them in one key. Visible only when focused. */}
            <a
              href="#main-content"
              className="sr-only rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-toast"
            >
              Skip to content
            </a>
            {/* `safe-frame` on the outer box and `safe-scroll-bottom` on the
                scroller are the whole of the installed-window handling: the
                document opts into `viewport-fit=cover` so the app paints under
                the iOS status bar and home indicator (which is what makes it
                look installed), and these two give the space back — at the top
                and sides as frame padding, at the bottom as room after the last
                row rather than a permanently short scroller. `h-dvh` still
                measures the whole viewport, so the frame is exactly the window
                and only `<main>` scrolls, unchanged from Phase 1. */}
            <div className="flex h-dvh w-full overflow-hidden safe-frame">
              <Sidebar account={account} projects={projects} />
              <div className="flex min-w-0 flex-1 flex-col">
                {/* Above the top bar, in the column, so that going offline
                    costs `<main>` a row and covers no control. */}
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
