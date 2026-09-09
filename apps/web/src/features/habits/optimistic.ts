import { habitDays, habitStats, isAmountHabit, weekProgress } from "@momentum/core/habits";
import { instant } from "@momentum/core/time";
import type { Habit, HabitCompletion, LocalDate } from "@momentum/core/types";

import type { CompletionPatch, HabitView, HabitsPageData } from "@/features/habits/types";

/** The fields `patchCompletions` needs of a habit: its identity, and how it accumulates. */
export type PatchableHabit = Pick<Habit, "id" | "userId" | "frequencyType">;

/**
 * Optimistic overlay for recording or un-recording a day. It patches the
 * completions and re-runs the same `@momentum/core/habits` functions the server
 * ran, so every derived number moves together; never nudge displayed numbers
 * individually. Pure; the server's answer replaces it on reconcile.
 */
export function applyCompletion(page: HabitsPageData, patch: CompletionPatch): HabitsPageData {
  const patchView = (view: HabitView): HabitView =>
    view.habit.id === patch.habitId ? recompute(view, patch, page) : view;

  return {
    ...page,
    active: page.active.map(patchView),
    archived: page.archived.map(patchView),
  };
}

function recompute(view: HabitView, patch: CompletionPatch, page: HabitsPageData): HabitView {
  const history = patchCompletions(
    view.history,
    view.habit,
    patch.date,
    patch.recorded,
    patch.amount,
  );

  return {
    ...view,
    history,
    week: habitDays(view.habit, page.week, history, page.today),
    progress: weekProgress(view.habit, page.week, history),
    stats: habitStats({
      habit: view.habit,
      completions: history,
      today: page.today,
      weekStart: page.weekStart,
      trackedFrom: view.trackedFrom,
    }),
  };
}

/**
 * The one row for `(habit, date)` — added, added to, or removed — mirroring
 * `record_habit_completion` / `remove_habit_completion`: a boolean habit's
 * second completion on a day is a no-op, an amount habit's accumulates, and
 * removal deletes the row. Exported because `/today` must predict the same row.
 * The optimistic `id` and `completedAt` are placeholders replaced on reconcile.
 */
export function patchCompletions(
  history: readonly HabitCompletion[],
  habit: PatchableHabit,
  date: LocalDate,
  recorded: boolean,
  amount: number,
): HabitCompletion[] {
  const rest = history.filter((row) => row.completionDate !== date);
  if (!recorded) return rest;

  const existing = history.find((row) => row.completionDate === date);
  const total = isAmountHabit(habit.frequencyType) ? (existing?.amount ?? 0) + amount : 1;

  const row: HabitCompletion = {
    id: existing?.id ?? `optimistic:${habit.id}:${date}`,
    habitId: habit.id,
    userId: habit.userId,
    completionDate: date,
    amount: total,
    sourceBlockId: existing?.sourceBlockId ?? null,
    completedAt: existing?.completedAt ?? instant(new Date().toISOString()),
  };

  return [...rest, row].sort((a, b) => a.completionDate.localeCompare(b.completionDate));
}
