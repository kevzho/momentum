import { AnalyticsSkeleton } from "@/features/analytics/components/analytics-skeleton";

/**
 * Built from the same layout components as the analytics page, so the skeleton
 * occupies the space the content will occupy and nothing shifts on arrival.
 */
export default function Loading() {
  return <AnalyticsSkeleton />;
}
