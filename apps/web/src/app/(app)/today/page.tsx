import type { Metadata } from "next";

import { TodayView } from "@/features/today/components/today-view";
import { getTodayPage } from "@/features/today/queries";

export const metadata: Metadata = { title: "Today" };

/**
 * The primary execution surface.
 *
 * One read on the server, one client island over it. Everything the page shows
 * is resolved in the profile timezone before it leaves this file
 * (docs/ARCHITECTURE.md §5, §6).
 */
export default async function TodayPage() {
  const data = await getTodayPage();
  return <TodayView data={data} />;
}
