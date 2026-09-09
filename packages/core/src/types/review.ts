import type { Instant, LocalDate, Uuid } from "./scalars";

/** Reflection prompts are optional; the week's numbers are derived from analytics, never stored here. */
export interface WeeklyReview {
  id: Uuid;
  userId: Uuid;
  weekStart: LocalDate;
  wentWell: string | null;
  gotInTheWay: string | null;
  changeNextWeek: string | null;
  completedAt: Instant | null;
  createdAt: Instant;
  updatedAt: Instant;
}
