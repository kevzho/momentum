import type { Metadata } from "next";

import { TasksView } from "@/features/tasks/components/tasks-view";
import { getTasksPage } from "@/features/tasks/queries";
import { parseTaskParams } from "@/features/tasks/view-params";

export const metadata: Metadata = { title: "Tasks" };

// The read is view-independent: a view is a filter the island applies, so
// switching view is a link, not a refetch.
export default async function TasksPage(props: PageProps<"/tasks">) {
  const [searchParams, data] = await Promise.all([props.searchParams, getTasksPage()]);

  return <TasksView data={data} params={parseTaskParams(searchParams)} />;
}
