import { OfflineNotice } from "@/components/offline-notice";

// A column rather than a single centred box, so `OfflineNotice` has a row of its own.
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
