import { OfflineNotice } from "@/components/offline-notice";

/**
 * The signed-out frame. Deliberately not `AppShell`: there is no navigation to
 * offer someone without an account, and the rail would be a row of links that
 * all bounce back here.
 *
 * A column rather than a single centred box, so that `OfflineNotice` has a row
 * of its own: signing in is the one thing on these screens, and it is the one
 * thing that cannot work without a connection.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col safe-overlay">
      <OfflineNotice />
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <main id="main-content" className="w-full max-w-sm">
          {children}
        </main>
      </div>
    </div>
  );
}
