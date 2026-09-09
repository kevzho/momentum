import type { Metadata } from "next";

import { nowInstant, todayIn } from "@momentum/core/time";

import { CalendarView } from "@/features/calendar/components/calendar-view";
import { displayedDays, parseCalendarParams, wantsNewEvent } from "@/features/calendar/navigation";
import { getCalendarWeek } from "@/features/calendar/queries";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Calendar" };

/**
 * The calendar's server half: resolve which range is being shown, read it, and
 * hand the result to the client island.
 *
 * "Today" is computed here, once per request, in the profile timezone — the
 * route is dynamic because it reads cookies, so there is no cached today and no
 * reason for the client to guess one (docs/ARCHITECTURE.md §10). The island
 * re-renders this page at the next local midnight rather than deriving a second
 * answer of its own.
 */
export default async function CalendarPage(props: PageProps<"/calendar">) {
  const [session, searchParams] = await Promise.all([requireSession(), props.searchParams]);
  const { profile } = session;

  const today = todayIn(profile.timezone, nowInstant());
  const params = parseCalendarParams(searchParams, today);
  const days = displayedDays(params, profile.weekStart);
  const data = await getCalendarWeek({ days });

  // `?new=event` is the command palette's "Add event": the page passes the
  // intent down, the island opens one draft and drops it from the URL.
  return <CalendarView data={data} params={params} newEvent={wantsNewEvent(searchParams)} />;
}
