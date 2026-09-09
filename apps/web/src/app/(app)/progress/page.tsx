import type { Metadata } from "next";

import { ProgressView } from "@/features/gamification/components/progress-view";
import { getProgressPage } from "@/features/gamification/queries";

export const metadata: Metadata = { title: "Progress" };

// Every date question is answered on the server in the profile timezone, and
// every number is derived from rows rather than stored.
export default async function ProgressPage() {
  const data = await getProgressPage();
  return <ProgressView data={data} />;
}
