"use client";

import * as React from "react";

import { intervalOfSlot } from "@momentum/core/scheduling";
import { amountToRecord } from "@momentum/core/habits";
import { nowInstant } from "@momentum/core/time";

import {
  rescheduleBlock,
  rescheduleOccurrence,
  setBlockCompletion,
} from "@/features/calendar/actions";
import type { DaySpan } from "@/features/calendar/types";
import { setCourseItemDone } from "@/features/courses/actions";
import { setHabitCompletion } from "@/features/habits/actions";
import { setTaskCompletion } from "@/features/tasks/actions";
import { applyTodayPatch, type TodayPatch } from "@/features/today/optimistic";
import type {
  TodayCourseItem,
  TodayHabit,
  TodayItem,
  TodayPageData,
  TodayTask,
} from "@/features/today/types";
import type { ActionResult } from "@/lib/actions/result";
import { useOptimisticAction } from "@/lib/actions/use-optimistic-action";
import { useUserSettings } from "@/lib/time/user-settings";

/**
 * Every `/today` mutation over one optimistic overlay: a single
 * `useOptimisticAction` whose action dispatches on the patch, since separate
 * `useOptimistic` calls would each hold a different view of the page. Every
 * call sends an id and at most a wall-clock span; never XP, timestamps or totals.
 */

interface Mutation {
  patch: TodayPatch;
  run: () => Promise<ActionResult<unknown>>;
  /** Rows to show as in flight, so a control can say it is writing without disabling itself. */
  touched: readonly string[];
}

export interface TodayMutations {
  /** The completion control on a timeline row or on Next Up. */
  setBlockCompleted: (entry: TodayItem, completed: boolean) => void;
  setTaskCompleted: (task: TodayTask, completed: boolean) => void;
  /** Record or un-record a habit for today, from the habits row. */
  setHabitRecorded: (row: TodayHabit, recorded: boolean) => void;
  /** Move a block to another wall-clock span. */
  reschedule: (entry: TodayItem, span: DaySpan) => void;
  /** Tick or untick a course checklist entry planned for today. */
  setCourseItemDone: (row: TodayCourseItem, done: boolean) => void;
}

export function useTodayMutations(serverState: TodayPageData): {
  state: TodayPageData;
  pending: boolean;
  pendingIds: ReadonlySet<string>;
  mutate: TodayMutations;
} {
  const { timezone } = useUserSettings();
  const [pendingIds, setPendingIds] = React.useState<ReadonlySet<string>>(new Set());

  const { state, run, pending } = useOptimisticAction<TodayPageData, Mutation, unknown>({
    serverState,
    optimistic: (current, mutation) => applyTodayPatch(current, mutation.patch),
    action: (mutation) => mutation.run(),
    onSuccess: (_data, mutation) => release(mutation.touched),
    onError: (_error, mutation) => release(mutation.touched),
  });

  function release(ids: readonly string[]): void {
    setPendingIds((current) => {
      const next = new Set(current);
      for (const id of ids) next.delete(id);
      return next;
    });
  }

  const dispatch = React.useCallback(
    (mutation: Mutation) => {
      setPendingIds((current) => new Set([...current, ...mutation.touched]));
      run(mutation);
    },
    [run],
  );

  const mutate = React.useMemo<TodayMutations>(
    () => ({
      setBlockCompleted: (entry, completed) => {
        const { item } = entry;
        // A virtual occurrence has no row to stamp; the control is not offered for one either.
        if (item.blockId === null) return;

        const alsoTask = completed && item.work?.completesTask === true;
        const habitDate = state.today;

        dispatch({
          patch: {
            kind: "block-completion",
            itemId: item.id,
            completed,
            alsoTask,
            habit: item.habitId === null ? null : { id: item.habitId, date: habitDate, amount: 1 },
            now: nowInstant(),
          },
          touched: [item.id],
          run: () =>
            setBlockCompletion({
              id: item.blockId,
              completed,
              alsoCompleteTask: alsoTask,
              // Un-completing a block that completed its task reopens the task: one action, reversible.
              alsoUncompleteTask:
                !completed && item.work !== null && item.work.taskCompletedAt !== null,
              habitId: item.habitId,
            }),
        });
      },

      setTaskCompleted: (task, completed) =>
        dispatch({
          patch: { kind: "task-completion", taskId: task.id, completed, now: nowInstant() },
          touched: [task.id],
          run: () => setTaskCompletion({ id: task.id, completed }),
        }),

      setHabitRecorded: (row, recorded) => {
        // The habits page asks the same function, so both surfaces record the same amount per press.
        const amount = amountToRecord(row.habit, row.day, row.progress);

        dispatch({
          patch: {
            kind: "habit-day",
            habitId: row.habit.id,
            date: state.today,
            recorded,
            amount,
          },
          touched: [row.habit.id],
          run: () =>
            setHabitCompletion({
              habitId: row.habit.id,
              date: state.today,
              recorded,
              amount,
            }),
        });
      },

      setCourseItemDone: (row, done) => {
        dispatch({
          patch: { kind: "course-item", itemId: row.item.id, done, now: nowInstant() },
          touched: [row.item.id],
          run: () => setCourseItemDone({ id: row.item.id, done }),
        });
      },

      reschedule: (entry, span) => {
        const { item } = entry;
        // The server applies the same wall-clock rule, so overlay and row agree on DST days.
        const interval = intervalOfSlot(span, timezone);

        dispatch({
          patch: {
            kind: "reschedule",
            itemId: item.id,
            startAt: interval.startAt,
            endAt: interval.endAt,
          },
          touched: [item.id],
          run: () =>
            item.occurrence !== null
              ? // The override is keyed to the date the rule produced, never the target date.
                rescheduleOccurrence({
                  seriesId: item.occurrence.seriesId,
                  occurrenceDate: item.occurrence.occurrenceDate,
                  date: span.date,
                  startMinutes: span.startMinutes,
                  endMinutes: span.endMinutes,
                })
              : rescheduleBlock({
                  id: item.blockId,
                  date: span.date,
                  startMinutes: span.startMinutes,
                  endMinutes: span.endMinutes,
                }),
        });
      },
    }),
    [dispatch, state.today, timezone],
  );

  return { state, pending, pendingIds, mutate };
}
