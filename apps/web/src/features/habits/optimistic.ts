import { habitDays, habitStats, isAmountHabit, weekProgress } from "@momentum/core/habits";
import { instant } from "@momentum/core/time";
import type { Habit, HabitCompletion, LocalDate } from "@momentum/core/types";

import type { CompletionPatch, HabitView, HabitsPageData } from "@/features/habits/types";

/** The fields `patchCompletions` needs of a habit: its identity, and how it accumulates. */
export type PatchableHabit = Pick<Habit, "id" | "userId" | "frequencyType">;

/**
 * The optimistic overlay for recording and un-recording a day.
 *
 * It does not patch the *displayed* numbers; it patches the *completions* and
 * then re-runs the same `@momentum/core/habits` functions the server ran
 * (docs/ARCHITECTURE.md §8). That is the point: the week strip, the progress
 * line, consistency, the two rates and both streaks all move together and stay
 * consistent with one another, because they are derived from one changed fact
 * rather than nudged individually. A reducer that incremented a percentage
 * would be a second implementation of the maths, and the two would disagree the
 * first time a week boundary or an amount habit was involved.
 *
 * It is pure, and the server's answer replaces it wholesale on reconcile — so
 * the only thing it has to get right is what the server will conclude, not how
 * to undo itself. On failure the transition settles against unchanged props and
 * React discards it (Domain Rule 11).
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
 * The one row for `(habit, date)` — added, added to, or removed.
 *
 * This mirrors `record_habit_completion` exactly, because an overlay's job is
 * to predict what that function will write (Domain Rule 14):
 *
 * - a boolean habit's second completion on a day is a no-op;
 * - an amount habit's accumulates;
 * - removing a day deletes the row rather than decrementing it, which is what
 *   `remove_habit_completion` does.
 *
 * Exported because `/today` records the same fact through the same action and
 * must predict the same row. Two reducers guessing separately at one database
 * function is exactly the duplication that ends with two surfaces showing
 * different numbers for the same day.
 *
 * The optimistic row's `id` and `completedAt` are placeholders: nothing reads
 * them, and the server's real values arrive on reconcile. `completedAt` uses
 * the client clock, which docs/ARCHITECTURE.md §8 permits for display only.
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
