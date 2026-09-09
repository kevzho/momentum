import type { Instant, LocalDate, Uuid } from "./scalars";

/** Phase 14. Reflection prompts are optional; the numbers are derived from Phase 10's aggregations, never stored here. */
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
