import { TasksSkeleton } from "@/features/tasks/components/tasks-skeleton";

/**
 * Built from the same layout components as the tasks page, so the skeleton
 * occupies the space the content will occupy and nothing shifts on arrival.
 */
export default function Loading() {
  return <TasksSkeleton />;
}
