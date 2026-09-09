import { minutesOfLocalTime } from "../time";
import type { LocalDate, Minutes } from "../types";
import {
  DEFAULT_HABIT_BLOCK_MINUTES,
  DEFAULT_HABIT_START_MINUTES,
  cadenceOf,
  isScheduledOn,
  type HabitSchedule,
} from "./model";

/**
 * "Add to week": the calendar blocks a habit's schedule asks for over one week.
 * Deliberately not recurrence: the action writes ordinary `calendar_blocks`
 * rows. Idempotent: occupied dates are never planned again (and count toward a
 * per-week target), and the past is never planned.
 */

/** One block to create: a wall-clock span on a named day. */
export interface HabitBlockPlan {
  date: LocalDate;
  startMinutes: Minutes;
  endMinutes: Minutes;
}

export interface PlanHabitWeekInput {
  habit: HabitSchedule;
  /** The seven dates of the target week, week-start first. */
  days: readonly LocalDate[];
  /** Today in the user's timezone. Days before it are not planned. */
  today: LocalDate;
  /** Dates in `days` that already carry a block for this habit. */
  occupied: readonly LocalDate[];
}

export function planHabitWeek(input: PlanHabitWeekInput): HabitBlockPlan[] {
  const { habit, days, today, occupied } = input;
  const taken = new Set<LocalDate>(occupied);

  // Lexicographic order on `YYYY-MM-DD` is chronological order.
  const candidates = days.filter((date) => date >= today);

  const chosen =
    cadenceOf(habit.frequencyType) === "per-day"
      ? candidates.filter((date) => isScheduledOn(habit, date) && !taken.has(date))
      : spreadAcrossWeek(candidates, taken, remainingSessions(habit, taken.size));

  return chosen.map((date) => ({ date, ...spanOf(habit) }));
}

/**
 * How many more sessions a per-week habit still wants this week. `amount_per_week`
 * says nothing about how many sittings it takes, so it gets one block.
 */
function remainingSessions(habit: HabitSchedule, alreadyPlaced: number): number {
  const wanted = habit.frequencyType === "times_per_week" ? habit.target : 1;
  return Math.max(0, wanted - alreadyPlaced);
}

/** `count` days from `candidates`, spread evenly over the days still free rather than the first N. */
function spreadAcrossWeek(
  candidates: readonly LocalDate[],
  taken: ReadonlySet<LocalDate>,
  count: number,
): LocalDate[] {
  const free = candidates.filter((date) => !taken.has(date));
  if (count <= 0 || free.length === 0) return [];
  if (count >= free.length) return [...free];

  const chosen: LocalDate[] = [];
  for (let i = 0; i < count; i += 1) {
    // Midpoints of `count` equal slices.
    const index = Math.round(((i + 0.5) * free.length) / count - 0.5);
    const date = free[Math.min(index, free.length - 1)];
    if (date !== undefined && !chosen.includes(date)) chosen.push(date);
  }
  return chosen;
}

/** The wall-clock span one generated block occupies; the start is pulled back so it never runs past midnight. */
function spanOf(habit: HabitSchedule): { startMinutes: Minutes; endMinutes: Minutes } {
  const minutes = habit.estimatedMinutes ?? DEFAULT_HABIT_BLOCK_MINUTES;
  const preferred =
    habit.preferredStartTime === null
      ? DEFAULT_HABIT_START_MINUTES
      : minutesOfLocalTime(habit.preferredStartTime);

  const startMinutes = Math.max(0, Math.min(preferred, MINUTES_PER_DAY - minutes));
  return { startMinutes, endMinutes: startMinutes + minutes };
}

const MINUTES_PER_DAY: Minutes = 1440;
