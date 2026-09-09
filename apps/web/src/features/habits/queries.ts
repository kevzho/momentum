import "server-only";

import { blocks, habits } from "@momentum/db";
import { habitDays, habitStats, weekProgress } from "@momentum/core/habits";
import { addDays, localDateOf, nowInstant, startOfDay, todayIn, weekOf } from "@momentum/core/time";
import type {
  CalendarBlock,
  Habit,
  HabitCompletion,
  IanaTimeZone,
  LocalDate,
  Uuid,
  Weekday,
} from "@momentum/core/types";

import type { HabitView, HabitsPageData } from "@/features/habits/types";
import { requireSession } from "@/lib/auth/session";

/**
 * The habits page's one read.
 *
 * Three queries — the habits, their completions over the heatmap range, and the
 * habit blocks in the displayed week — resolved together. Every number the page
 * shows is then computed from that one result by the pure functions in
 * `@momentum/core/habits`: the week strip, the progress bar, consistency, the
 * two success rates, the streaks and the heatmap are all the same rows counted
 * differently, so there is no per-panel query and nothing that can disagree
 * with the panel beside it.
 *
 * "Today", the week and the heatmap range all resolve in `profile.timezone`
 * (Domain Rule 4), once per request. The client is handed dates, never a clock.
 */

/**
 * How far back the long-range heatmap reaches.
 *
 * Twelve weeks plus the current partial one: long enough to show a habit's
 * shape and a gap in it, short enough that a year of rows is not fetched to
 * render a row that is 700px wide.
 */
export const HEATMAP_WEEKS = 12;

export async function getHabitsPage(): Promise<HabitsPageData> {
  const { supabase, userId, profile } = await requireSession();
  const timezone = profile.timezone;
  const weekStart = profile.weekStart;

  const today = todayIn(timezone, nowInstant());
  const week = weekOf(today, weekStart);
  const historyFrom = addDays(week.start, -7 * (HEATMAP_WEEKS - 1));

  const habitRows = await habits.listFor(supabase, userId);

  /*
   * Completions are read for the whole heatmap range, not for the week, because
   * every rate on the page is measured over a longer window than the week strip
   * shows — consistency over 30 days, the month-to-date rate over up to 31.
   * Twelve weeks covers all of them, so the page is three queries rather than
   * one per statistic.
   *
   * Streaks are the exception and are deliberately measured over the same
   * range: a "best run" is reported as "the best run in the last twelve weeks",
   * not as an all-time record, because reading a user's whole history to render
   * a list row is a cost that grows for ever.
   */
  const [completionRows, blockRows] = await Promise.all([
    habits.listCompletionsBetween(supabase, userId, historyFrom, today),
    blocks.listForHabits(
      supabase,
      habitRows.map((habit) => habit.id),
      {
        start: startOfDay(week.start, timezone),
        end: startOfDay(addDays(week.start, 7), timezone),
      },
    ),
  ]);

  const byHabit = groupCompletions(completionRows);
  const reserved = groupReservedDates(blockRows, timezone);

  const views = habitRows.map((habit) =>
    toView({
      habit,
      completions: byHabit.get(habit.id) ?? [],
      reservedDates: reserved.get(habit.id) ?? [],
      days: week.days,
      today,
      weekStart,
      historyFrom,
      timezone,
    }),
  );

  return {
    today,
    timezone,
    weekStart,
    week: week.days,
    historyFrom,
    active: views.filter((view) => view.habit.archivedAt === null),
    archived: views.filter((view) => view.habit.archivedAt !== null),
  };
}

interface ToViewInput {
  habit: Habit;
  completions: readonly HabitCompletion[];
  reservedDates: readonly LocalDate[];
  days: readonly LocalDate[];
  today: LocalDate;
  weekStart: Weekday;
  historyFrom: LocalDate;
  timezone: IanaTimeZone;
}

/**
 * One habit, resolved.
 *
 * `trackedFrom` is the later of the habit's creation date and the start of the
 * read range: a habit created on Thursday is not measured against the Monday it
 * did not exist on, and a rate is never computed over rows this query did not
 * fetch. Both clips matter — the first is Domain Rule 7 (nothing is expected of
 * a habit before it existed), the second is simply honesty about the data on
 * hand.
 */
function toView(input: ToViewInput): HabitView {
  const { habit, completions, days, today, weekStart, historyFrom, timezone } = input;
  const createdOn = localDateOf(habit.createdAt, timezone);
  const trackedFrom = createdOn > historyFrom ? createdOn : historyFrom;

  return {
    habit,
    week: habitDays(habit, days, completions, today),
    progress: weekProgress(habit, days, completions),
    stats: habitStats({ habit, completions, today, weekStart, trackedFrom }),
    reservedDates: input.reservedDates,
    trackedFrom,
    history: completions,
  };
}

/* -------------------------------------------------------------------------- */
/* Grouping                                                                   */
/* -------------------------------------------------------------------------- */

function groupCompletions(rows: readonly HabitCompletion[]): Map<Uuid, HabitCompletion[]> {
  const byHabit = new Map<Uuid, HabitCompletion[]>();
  for (const row of rows) {
    const list = byHabit.get(row.habitId);
    if (list) list.push(row);
    else byHabit.set(row.habitId, [row]);
  }
  return byHabit;
}

/**
 * Which local dates already carry a block for each habit.
 *
 * The date a block belongs to is the day it *starts* on, resolved in the
 * profile timezone — the same convention the calendar's own reads use. This is
 * what "Add to week" differences against, so pressing it twice tops the week up
 * instead of doubling it.
 */
function groupReservedDates(
  rows: readonly CalendarBlock[],
  timezone: IanaTimeZone,
): Map<Uuid, LocalDate[]> {
  const byHabit = new Map<Uuid, LocalDate[]>();

  for (const block of rows) {
    if (block.kind !== "habit") continue;
    const date = localDateOf(block.startAt, timezone);
    const list = byHabit.get(block.habitId);
    if (list) {
      if (!list.includes(date)) list.push(date);
    } else {
      byHabit.set(block.habitId, [date]);
    }
  }

  return byHabit;
}
