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
 * The habits feature's view models.
 *
 * The server reads habits, their completions and their calendar blocks, runs
 * the pure functions in `@momentum/core/habits` over them, and hands the client
 * island the shapes below. The client never fetches, never resolves a date and
 * never sees a database row (docs/ARCHITECTURE.md §5, §6).
 *
 * Every date here is a `LocalDate` already resolved in the profile timezone,
 * and "today" is computed once per request — so the server render and the
 * hydrated client render agree, and the week strip cannot disagree with the
 * consistency number beside it (Domain Rule 4).
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
   * The first date this habit is measured from: the later of its creation date
   * and the start of the read range.
   *
   * Carried to the client so the optimistic overlay recomputes every rate the
   * way the server did. A client that guessed at it would show one consistency
   * figure during the write and a different one when the server answered, which
   * is the silent divergence Domain Rule 11 forbids.
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

/**
 * The optimistic overlay's unit of change: one habit's record for one day.
 *
 * Recording and un-recording are the same shape because they are the same
 * gesture in two directions, and the reducer that applies them has to be able
 * to undo either (docs/ARCHITECTURE.md §8).
 */
export interface CompletionPatch {
  habitId: Uuid;
  date: LocalDate;
  /** True to record, false to remove. */
  recorded: boolean;
  /** What an amount habit adds; ignored by boolean habits. */
  amount: number;
}
