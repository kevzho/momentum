import { amountsByDate, habitDay, weekProgress } from "@momentum/core/habits";
import type { Instant, LocalDate, Uuid } from "@momentum/core/types";

import { patchCompletions } from "@/features/habits/optimistic";
import { buildTimeline } from "@/features/today/agenda";
import type { TodayHabit, TodayItem, TodayPageData, TodayTask } from "@/features/today/types";

/**
 * The optimistic overlay for every `/today` mutation. It patches facts and
 * re-derives everything else, never nudging displayed values individually.
 * Pure; on failure React discards it, so no revert is written here.
 */

export type TodayPatch =
  BlockCompletionPatch | TaskCompletionPatch | HabitDayPatch | ReschedulePatch | CourseItemPatch;

/** Ticking a course checklist entry planned for today. It earns nothing, so XP is untouched. */
export interface CourseItemPatch {
  kind: "course-item";
  itemId: Uuid;
  done: boolean;
  now: Instant;
}

/**
 * A block's completion control. `alsoTask` is the server-decided promise from
 * `features/calendar/items.ts` (the block was its task's last incomplete one);
 * `habit` is set for a habit block, whose completion also records the habit.
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

/** Completing a task from a task row marks the task and leaves its blocks alone; they settle via `taskCompletedAt`. */
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
    case "course-item":
      return {
        ...page,
        courseItems: page.courseItems.map((row) =>
          row.item.id === patch.itemId
            ? { ...row, item: { ...row.item, completedAt: patch.done ? patch.now : null } }
            : row,
        ),
      };
  }
}

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
          // Un-completing a habit block removes that day's row.
          recorded: patch.completed,
          amount: patch.habit.amount,
        });

  return { ...withHabit, timeline };
}

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

/** A habit's day, recomputed from its patched completions via the same core functions the server ran. */
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

/** Rebuilds the whole timeline: a move changes order, today's coverage, and whether the block belongs on the page. */
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
