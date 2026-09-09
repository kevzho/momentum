import { FocusSkeleton } from "@/features/focus/components/focus-skeleton";

/**
 * Built from the same layout components as the focus page, so the skeleton
 * occupies the space the content will occupy and nothing shifts on arrival.
 */
export default function Loading() {
  return <FocusSkeleton />;
}
