import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CourseView } from "@/features/courses/components/course-view";
import { getCoursePage } from "@/features/courses/queries";
import { isUuid } from "@/lib/uuid";

export const metadata: Metadata = { title: "Course" };

export default async function CoursePage(props: PageProps<"/courses/[id]">) {
  const { id } = await props.params;
  // A malformed id is a 404, not a database error.
  if (!isUuid(id)) notFound();
  const data = await getCoursePage(id);
  return <CourseView data={data} />;
}
