import type { Metadata } from "next";

import { HabitsView } from "@/features/habits/components/habits-view";
import { wantsNewHabit } from "@/features/habits/navigation";
import { getHabitsPage } from "@/features/habits/queries";

export const metadata: Metadata = { title: "Habits" };

/**
 * The page reads; the island renders (docs/ARCHITECTURE.md §5, §6).
 *
 * One query resolves the habits, their completions and this week's habit
 * blocks, and computes every rate on the server in the profile timezone — so
 * the first paint is the real page and "today" cannot differ between the two
 * renders (Domain Rule 4).
 */
export default async function HabitsPage(props: PageProps<"/habits">) {
  // `?new=habit` is the command palette's "Add habit": the page passes the
  // intent down, the island opens its form once and drops it from the URL.
  const [data, searchParams] = await Promise.all([getHabitsPage(), props.searchParams]);
  return <HabitsView data={data} newHabit={wantsNewHabit(searchParams)} />;
}
