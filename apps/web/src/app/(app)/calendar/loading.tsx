import { CalendarSkeleton } from "@/features/calendar/components/calendar-skeleton";

/**
 * Built from the same layout components as the calendar page, so the skeleton
 * occupies the space the content will occupy and nothing shifts on arrival.
 */
export default function Loading() {
  return <CalendarSkeleton />;
}
