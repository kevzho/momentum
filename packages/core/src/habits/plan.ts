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
 * "Add to week": which calendar blocks a habit's schedule asks for, over one
 * week, given what is already there.
 *
 * This is the whole of Phase 6's calendar generation, and it is deliberately
 * not recurrence (docs/ARCHITECTURE.md §11). It produces wall-clock spans on
 * named dates; the action converts them to instants with the profile timezone
 * and writes ordinary `calendar_blocks` rows, exactly like a task being
 * dragged onto the grid. Nothing is materialized ahead of time and nothing is
 * expanded at read time — the rows are just blocks.
 *
 * Two properties make pressing the button twice safe:
 *
 * - **Dates already carrying a block for this habit are never planned again.**
 *   For the per-day cadence that is a per-date skip; for the per-week cadence
 *   the existing blocks count toward the week's target, so a habit with three
 *   runs a week and one block already placed is planned two more, not three.
 * - **The past is never planned.** A week containing today starts at today; a
 *   week entirely in the past produces nothing. Reserving time that has already
 *   gone by would put a commitment on the board the user cannot keep, and
 *   Domain Rule 7 is why that is not a thing this product does.
 */

/** One block to create: a wall-clock span on a named day (Domain Rule 4). */
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

  // `>=` on `YYYY-MM-DD` is a date comparison: the format is fixed-width and
  // big-endian, so lexicographic order is chronological order. No parsing, and
  // therefore no timezone to get wrong (Domain Rule 5).
  const candidates = days.filter((date) => date >= today);

  const chosen =
    cadenceOf(habit.frequencyType) === "per-day"
      ? candidates.filter((date) => isScheduledOn(habit, date) && !taken.has(date))
      : spreadAcrossWeek(candidates, taken, remainingSessions(habit, taken.size));

  return chosen.map((date) => ({ date, ...spanOf(habit) }));
}

/**
 * How many more sessions a per-week habit still wants this week.
 *
 * `times_per_week` names a number of days, so its target is the session count.
 * `amount_per_week` names a quantity — 120 minutes, 5 problems — which says
 * nothing about how many sittings it takes, so it gets one block and the user
 * places any others themselves. Guessing at a split would be inventing a
 * schedule the habit does not describe.
 */
function remainingSessions(habit: HabitSchedule, alreadyPlaced: number): number {
  const wanted = habit.frequencyType === "times_per_week" ? habit.target : 1;
  return Math.max(0, wanted - alreadyPlaced);
}

/**
 * `count` days chosen from `candidates`, spread as evenly as the remaining days
 * allow and skipping days that already carry a block.
 *
 * Evenly rather than "the first N": three runs a week belong on roughly
 * alternate days, not on Monday, Tuesday and Wednesday. The spread is computed
 * over the days still available, so asking again mid-week fills the gaps rather
 * than restarting at the top of the week.
 */
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
    // Midpoints of `count` equal slices, so two sessions land on the thirds of
    // the available days rather than both at one end.
    const index = Math.round(((i + 0.5) * free.length) / count - 0.5);
    const date = free[Math.min(index, free.length - 1)];
    if (date !== undefined && !chosen.includes(date)) chosen.push(date);
  }
  return chosen;
}

/**
 * The wall-clock span one generated block occupies.
 *
 * Both halves are optional on a habit (specs/06-habits.md), so both have a
 * documented default. The start is pulled back if the block would otherwise run
 * past midnight: a habit block is a commitment inside one day, and a span that
 * crossed the boundary would render in two columns for no reason the user asked
 * for.
 */
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
