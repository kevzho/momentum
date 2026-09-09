import type { Metadata } from "next";

import { TodayView } from "@/features/today/components/today-view";
import { getTodayPage } from "@/features/today/queries";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  const data = await getTodayPage();
  return <TodayView data={data} />;
}
