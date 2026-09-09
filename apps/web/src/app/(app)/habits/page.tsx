import type { Metadata } from "next";

import { HabitsView } from "@/features/habits/components/habits-view";
import { wantsNewHabit } from "@/features/habits/navigation";
import { getHabitsPage } from "@/features/habits/queries";

export const metadata: Metadata = { title: "Habits" };

// Every rate is computed on the server in the profile timezone, so "today"
// cannot differ between the two renders.
export default async function HabitsPage(props: PageProps<"/habits">) {
  // `?new=habit` is the command palette's "Add habit": the island opens its
  // form once and drops it from the URL.
  const [data, searchParams] = await Promise.all([getHabitsPage(), props.searchParams]);
  return <HabitsView data={data} newHabit={wantsNewHabit(searchParams)} />;
}
