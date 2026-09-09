import type { Metadata } from "next";

import { nowInstant, todayIn } from "@momentum/core/time";

import { CalendarView } from "@/features/calendar/components/calendar-view";
import { displayedDays, parseCalendarParams, wantsNewEvent } from "@/features/calendar/navigation";
import { getCalendarWeek } from "@/features/calendar/queries";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Calendar" };

// "Today" is computed here, once per request, in the profile timezone; the
// island re-renders this page at the next local midnight rather than
// deriving a second answer.
export default async function CalendarPage(props: PageProps<"/calendar">) {
  const [session, searchParams] = await Promise.all([requireSession(), props.searchParams]);
  const { profile } = session;

  const today = todayIn(profile.timezone, nowInstant());
  const params = parseCalendarParams(searchParams, today);
  const days = displayedDays(params, profile.weekStart);
  const data = await getCalendarWeek({ days });

  // `?new=event` is the command palette's "Add event": the island opens one
  // draft and drops it from the URL.
  return <CalendarView data={data} params={params} newEvent={wantsNewEvent(searchParams)} />;
}
