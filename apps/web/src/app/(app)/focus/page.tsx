import type { Metadata } from "next";

import { FocusView } from "@/features/focus/components/focus-view";
import { getFocusPage } from "@/features/focus/queries";
import type { FocusSearchParams } from "@/features/focus/search-params";

export const metadata: Metadata = { title: "Focus" };

/**
 * The page reads; the island renders (docs/ARCHITECTURE.md §5, §6).
 *
 * `?task=` and `?minutes=` are how a task and a calendar block launch a
 * session: the link carries what to work on and how long, the server resolves
 * the task (and drops it if it no longer exists), and the setup panel opens
 * pre-filled. `searchParams` is passed through under its own keys
 * (`FocusSearchParams`), so there is no mapping here to drift from the URL.
 * Nothing is started by navigating — the user still presses the button,
 * because a link that started a timer would start one every time it was
 * followed, including by a back button.
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
