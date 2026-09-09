import type { Metadata } from "next";

import { AnalyticsView } from "@/features/analytics/components/analytics-view";
import { getAnalyticsPage } from "@/features/analytics/queries";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  const data = await getAnalyticsPage();
  return <AnalyticsView data={data} />;
}
