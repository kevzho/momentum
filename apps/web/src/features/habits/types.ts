import type { HabitDay, HabitProgress, HabitStats } from "@momentum/core/habits";
import type {
  Habit,
  HabitCompletion,
  IanaTimeZone,
  LocalDate,
  Uuid,
  Weekday,
} from "@momentum/core/types";

/**
 * View models handed to the habits client island. Every date is a `LocalDate`
 * already resolved in the profile timezone; "today" is computed once per request.
 */

/** One habit, with everything the row and its detail view need. */
export interface HabitView {
  habit: Habit;
  /** The displayed week, week-start first, one entry per day. */
  week: readonly HabitDay[];
  /** Progress toward the habit's target over that week. */
  progress: HabitProgress;
  stats: HabitStats;
  /** Dates in the displayed week that already have a calendar block for it. */
  reservedDates: readonly LocalDate[];
  /**
   * First date the habit is measured from: the later of its creation date and
   * the read range start. Carried so the optimistic overlay recomputes rates
   * exactly as the server did.
   */
  trackedFrom: LocalDate;
  /** Completions inside the heatmap range, oldest first. */
  history: readonly HabitCompletion[];
}

/** Everything `/habits` renders. */
export interface HabitsPageData {
  /** "Today" in the profile timezone, resolved once on the server. */
  today: LocalDate;
  timezone: IanaTimeZone;
  weekStart: Weekday;
  /** The seven dates of the displayed week, week-start first. */
  week: readonly LocalDate[];
  /** The first date of the long-range heatmap; it runs to `today`. */
  historyFrom: LocalDate;
  active: readonly HabitView[];
  archived: readonly HabitView[];
}

/** One habit's record for one day; recording and un-recording share the shape. */
export interface CompletionPatch {
  habitId: Uuid;
  date: LocalDate;
  /** True to record, false to remove. */
  recorded: boolean;
  /** What an amount habit adds; ignored by boolean habits. */
  amount: number;
}
