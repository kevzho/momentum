import type { WeeklyReview } from "@momentum/core/types";

import type { Row } from "../types";
import { toInstant, toInstantOrNull, toLocalDate } from "./scalars";

export function rowToWeeklyReview(row: Row<"weekly_reviews">): WeeklyReview {
  return {
    id: row.id,
    userId: row.user_id,
    weekStart: toLocalDate(row.week_start),
    wentWell: row.went_well,
    gotInTheWay: row.got_in_the_way,
    changeNextWeek: row.change_next_week,
    completedAt: toInstantOrNull(row.completed_at),
    createdAt: toInstant(row.created_at),
    updatedAt: toInstant(row.updated_at),
  };
}
