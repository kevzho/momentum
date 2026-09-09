import type { Metadata } from "next";

import { TasksView } from "@/features/tasks/components/tasks-view";
import { getTasksPage } from "@/features/tasks/queries";
import { parseTaskParams } from "@/features/tasks/view-params";

export const metadata: Metadata = { title: "Tasks" };

/**
 * The task manager's server half: resolve which view is being shown, read the
 * data, and hand both to the client island.
 *
 * The read is view-independent on purpose — a view is a filter over the same
 * data, and the island applies the same pure predicates the tests cover
 * (`features/tasks/types.ts`). Switching view is therefore a link, not a
 * refetch.
 */
export default async function TasksPage(props: PageProps<"/tasks">) {
  const [searchParams, data] = await Promise.all([props.searchParams, getTasksPage()]);

  return <TasksView data={data} params={parseTaskParams(searchParams)} />;
}
