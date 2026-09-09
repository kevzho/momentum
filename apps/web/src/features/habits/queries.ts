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
 * The habits page's one read: habits, completions over the heatmap range and
 * the week's habit blocks. Every displayed number derives from that result via
 * `@momentum/core/habits`. Dates resolve in `profile.timezone` once per request.
 */

/** Weeks of history read, including the current partial one. */
export const HEATMAP_WEEKS = 12;

export async function getHabitsPage(): Promise<HabitsPageData> {
  const { supabase, userId, profile } = await requireSession();
  const timezone = profile.timezone;
  const weekStart = profile.weekStart;

  const today = todayIn(timezone, nowInstant());
  const week = weekOf(today, weekStart);
  const historyFrom = addDays(week.start, -7 * (HEATMAP_WEEKS - 1));

  const habitRows = await habits.listFor(supabase, userId);

  // Completions are read over the whole heatmap range because every rate
  // (consistency over 30 days, month-to-date) spans more than the week. Streaks
  // are deliberately measured over the same range — "best run" means best in
  // the last twelve weeks — so the read never grows with the user's history.
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
 * `trackedFrom` is the later of the habit's creation date and the read range
 * start: nothing is expected of a habit before it existed, and no rate is
 * computed over rows this query did not fetch.
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
 * Local dates already carrying a block, per habit, keyed by the day the block
 * starts in the profile timezone (the calendar's convention). "Add to week"
 * differences against this.
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
