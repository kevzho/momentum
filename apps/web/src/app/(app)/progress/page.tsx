import type { Metadata } from "next";

import { ProgressView } from "@/features/gamification/components/progress-view";
import { getProgressPage } from "@/features/gamification/queries";

export const metadata: Metadata = { title: "Progress" };

/**
 * The page reads; the island renders (docs/ARCHITECTURE.md §5, §6).
 *
 * One query resolves the quests, their progress, the achievements, the shop and
 * the ledger — every date question answered on the server in the profile
 * timezone, and every number derived from rows rather than stored (Domain
 * Rules 4, 6).
 */
export default async function ProgressPage() {
  const data = await getProgressPage();
  return <ProgressView data={data} />;
}
