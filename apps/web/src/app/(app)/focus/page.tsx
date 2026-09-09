import type { Metadata } from "next";

import { FocusView } from "@/features/focus/components/focus-view";
import { getFocusPage } from "@/features/focus/queries";
import type { FocusSearchParams } from "@/features/focus/search-params";

export const metadata: Metadata = { title: "Focus" };

/**
 * `?task=` and `?minutes=` are how a task and a calendar block launch a
 * session; the setup panel opens pre-filled. Nothing is started by navigating:
 * a link that started a timer would start one every time it was followed,
 * including by a back button.
 */
export default async function FocusPage({
  searchParams,
}: {
  searchParams: Promise<FocusSearchParams>;
}) {
  const params = await searchParams;
  const data = await getFocusPage(params);
  return <FocusView data={data} />;
}
