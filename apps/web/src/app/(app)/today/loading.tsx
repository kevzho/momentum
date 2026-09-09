import { TodaySkeleton } from "@/features/today/components/today-skeleton";

/**
 * Built from the same layout components as the today page, so the skeleton
 * occupies the space the content will occupy and nothing shifts on arrival.
 */
export default function Loading() {
  return <TodaySkeleton />;
}
