import { HabitsSkeleton } from "@/features/habits/components/habits-skeleton";

/**
 * Built from the same layout components as the habits page, so the skeleton
 * occupies the space the content will occupy and nothing shifts on arrival.
 */
export default function Loading() {
  return <HabitsSkeleton />;
}
