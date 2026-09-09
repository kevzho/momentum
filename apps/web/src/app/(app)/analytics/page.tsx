import type { Metadata } from "next";

import { AnalyticsView } from "@/features/analytics/components/analytics-view";
import { getAnalyticsPage } from "@/features/analytics/queries";

export const metadata: Metadata = { title: "Analytics" };

/**
 * One read on the server, one client island over it. Ninety days of rows are
 * aggregated into all three windows here, in the profile timezone, before
 * anything reaches the browser (docs/ARCHITECTURE.md §5, §6).
 */
export default async function AnalyticsPage() {
  const data = await getAnalyticsPage();
  return <AnalyticsView data={data} />;
}
