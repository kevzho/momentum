import { notFound } from "next/navigation";

import { getSyllabusFileUrl } from "@/features/courses/queries";
import { isUuid } from "@/lib/uuid";

/**
 * Opens the course's syllabus PDF. The bucket is private, so this mints a
 * short-lived signed URL for the signed-in owner and sends the browser to it;
 * the file itself never streams through the app.
 */
export async function GET(_request: Request, context: RouteContext<"/api/courses/[id]/syllabus">) {
  const { id } = await context.params;
  if (!isUuid(id)) notFound();
  const url = await getSyllabusFileUrl(id);
  if (url === null) notFound();
  // A plain redirect to an external, short-lived URL; `redirect()` from
  // next/navigation is typed for the app's own routes.
  return Response.redirect(url, 302);
}
