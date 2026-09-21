import type { Metadata } from "next";

import { CoursesView } from "@/features/courses/components/courses-view";
import { getCoursesPage } from "@/features/courses/queries";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Courses" };

// Every date is resolved on the server in the profile timezone; the island reads no clock.
export default async function CoursesPage() {
  const [data, session] = await Promise.all([getCoursesPage(), requireSession()]);
  return <CoursesView data={data} weekStart={session.profile.weekStart} />;
}
