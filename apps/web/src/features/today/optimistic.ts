import { amountsByDate, habitDay, weekProgress } from "@momentum/core/habits";
import type { Instant, LocalDate, Uuid } from "@momentum/core/types";

import { patchCompletions } from "@/features/habits/optimistic";
import { buildTimeline } from "@/features/today/agenda";
import type { TodayHabit, TodayItem, TodayPageData, TodayTask } from "@/features/today/types";

/**
 * The optimistic overlay for every mutation `/today` can make.
 *
 * It patches *facts* and re-derives everything else, which is the arrangement
 * `features/habits/optimistic.ts` uses and for the same reason: the timeline,
 * Next Up, the habit counts and the At Risk section are all functions of the
 * same page, so a reducer that nudged each of them individually would be four
 * implementations of one change and they would disagree the first time a block
 * completed its task.
 *
 * It is pure, and the server's answer replaces it wholesale on reconcile — so
 * the only thing it has to get right is what the server will conclude, not how
 * to undo itself. On failure the transition settles against unchanged props and
 * React discards it; there is no revert written here, and therefore none to get
 * wrong (Domain Rule 11, docs/ARCHITECTURE.md §8).
 */

export type TodayPatch =
  BlockCompletionPatch | TaskCompletionPatch | HabitDayPatch | ReschedulePatch;

/**
 * A block's completion control.
 *
 * `alsoTask` carries the label's promise — the block was its task's only one,
 * or its last incomplete one — decided by the server in
 * `features/calendar/items.ts` so the wording and the effect come from one
 * calculation (Domain Rule 13). `habit` is set for a habit block, whose
 * completion is two facts in one transaction: the span was executed, and the
 * habit was done on the block's own local date (Domain Rule 14).
 */
export interface BlockCompletionPatch {
  kind: "block-completion";
  itemId: string;
  completed: boolean;
  alsoTask: boolean;
  habit: { id: Uuid; date: LocalDate; amount: number } | null;
  /** The client's clock, for display only until the server's value arrives. */
  now: Instant;
}

/**
 * Completing a task from a task row.
 *
 * It marks the task and leaves its blocks alone — Domain Rule 13 is explicit
 * that completing a task from anywhere other than a block does exactly that.
 * The blocks still settle, because a block whose task is complete renders as
 * settled and is skipped by Next Up; that follows from `taskCompletedAt`.
 */
export interface TaskCompletionPatch {
  kind: "task-completion";
  taskId: Uuid;
  completed: boolean;
  now: Instant;
}

/** Recording or un-recording a habit for today, from the habits row. */
export interface HabitDayPatch {
  kind: "habit-day";
  habitId: Uuid;
  date: LocalDate;
  recorded: boolean;
  amount: number;
}

/** A block moved to another time, from Next Up's Reschedule control. */
export interface ReschedulePatch {
  kind: "reschedule";
  itemId: string;
  startAt: Instant;
  endAt: Instant;
}

export function applyTodayPatch(page: TodayPageData, patch: TodayPatch): TodayPageData {
  switch (patch.kind) {
    case "block-completion":
      return applyBlockCompletion(page, patch);
    case "task-completion":
      return applyTaskCompletion(page, patch);
    case "habit-day":
      return applyHabitDay(page, patch);
    case "reschedule":
      return applyReschedule(page, patch);
  }
}

/* -------------------------------------------------------------------------- */
/* Blocks                                                                     */
/* -------------------------------------------------------------------------- */

function applyBlockCompletion(page: TodayPageData, patch: BlockCompletionPatch): TodayPageData {
  const completedAt = patch.completed ? patch.now : null;
  const target = page.timeline.find((entry) => entry.item.id === patch.itemId);
  const taskId = patch.alsoTask ? (target?.item.work?.taskId ?? null) : null;

  const timeline = page.timeline.map((entry) => {
    const completesThis = entry.item.id === patch.itemId;
    const settlesTask = taskId !== null && entry.item.work?.taskId === taskId;
    if (!completesThis && !settlesTask) return entry;

    return {
      ...entry,
      item: {
        ...entry.item,
        completedAt: completesThis ? completedAt : entry.item.completedAt,
        work:
          entry.item.work === null || !settlesTask
            ? entry.item.work
            : { ...entry.item.work, taskCompletedAt: completedAt, completesTask: false },
      },
    };
  });

  const withTask = taskId === null ? page : markTask(page, taskId, completedAt);
  const withHabit =
    patch.habit === null
      ? withTask
      : applyHabitDay(withTask, {
          kind: "habit-day",
          habitId: patch.habit.id,
          date: patch.habit.date,
          // Un-completing a habit block removes only the completion that block
          // created, which for the block's own day is the whole row here.
          recorded: patch.completed,
          amount: patch.habit.amount,
        });

  return { ...withHabit, timeline };
}

/* -------------------------------------------------------------------------- */
/* Tasks                                                                      */
/* -------------------------------------------------------------------------- */

function applyTaskCompletion(page: TodayPageData, patch: TaskCompletionPatch): TodayPageData {
  const completedAt = patch.completed ? patch.now : null;
  const marked = markTask(page, patch.taskId, completedAt);

  return {
    ...marked,
    timeline: marked.timeline.map((entry) =>
      entry.item.work?.taskId !== patch.taskId || entry.item.work === null
        ? entry
        : {
            ...entry,
            item: {
              ...entry.item,
              work: { ...entry.item.work, taskCompletedAt: completedAt, completesTask: false },
            },
          },
    ),
  };
}

/** The same task appears in up to three lists; a completion has to reach all of them. */
function markTask(page: TodayPageData, taskId: Uuid, completedAt: Instant | null): TodayPageData {
  const mark = (task: TodayTask): TodayTask =>
    task.id === taskId ? { ...task, completedAt } : task;

  return {
    ...page,
    tasks: page.tasks.map(mark),
    overdue: page.overdue.map(mark),
    candidates: page.candidates.map(mark),
  };
}

/* -------------------------------------------------------------------------- */
/* Habits                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A habit's day, recomputed from its patched completions.
 *
 * The row's state, the week's progress and the section's count all come back
 * out of `@momentum/core/habits` rather than being nudged, so a per-week habit
 * that has just reached its target reports so consistently across all three.
 * `patchCompletions` is `features/habits/optimistic.ts`'s — the one prediction
 * of what `record_habit_completion` will write (Domain Rule 14).
 */
function applyHabitDay(page: TodayPageData, patch: HabitDayPatch): TodayPageData {
  return {
    ...page,
    habits: page.habits.map((row) => {
      if (row.habit.id !== patch.habitId) return row;

      const completions = patchCompletions(
        row.completions,
        row.habit,
        patch.date,
        patch.recorded,
        patch.amount,
      );

      return {
        ...row,
        completions,
        day: habitDay(
          row.habit,
          page.today,
          amountsByDate(completions).get(page.today) ?? 0,
          page.today,
        ),
        progress: weekProgress(row.habit, page.week, completions),
      } satisfies TodayHabit;
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* Reschedule                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A block moved to another time.
 *
 * The whole timeline is rebuilt rather than the row edited in place, because
 * moving a block changes where it sits in the order, how much of today it
 * covers, and — when it is moved off today entirely — whether it belongs on the
 * page at all. `buildTimeline` answers all three, and it is the same function
 * the server ran, so the overlay and the reconciled render cannot place the
 * block differently.
 */
function applyReschedule(page: TodayPageData, patch: ReschedulePatch): TodayPageData {
  const sources = page.timeline.map((entry: TodayItem) =>
    entry.item.id === patch.itemId
      ? {
          item: { ...entry.item, startAt: patch.startAt, endAt: patch.endAt },
          project: entry.project,
        }
      : { item: entry.item, project: entry.project },
  );

  return { ...page, timeline: buildTimeline(sources, page.today, page.timezone) };
}
