import { notFound } from "next/navigation";

import { getCourseFileUrl } from "@/features/courses/queries";
import { isUuid } from "@/lib/uuid";

/**
 * Opens one of the course's PDFs, like the syllabus route: a short-lived
 * signed URL for the owner and a redirect to it. A `#page=N` on this URL is
 * kept by the browser across the redirect, so a reading can link to its page.
 */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/courses/[id]/files/[fileId]">,
) {
  const { id, fileId } = await context.params;
  if (!isUuid(id) || !isUuid(fileId)) notFound();
  const url = await getCourseFileUrl(id, fileId);
  if (url === null) notFound();
  return Response.redirect(url, 302);
}
