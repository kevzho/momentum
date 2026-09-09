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
import { setHabitCompletion } from "@/features/habits/actions";
import { setTaskCompletion } from "@/features/tasks/actions";
import { applyTodayPatch, type TodayPatch } from "@/features/today/optimistic";
import type { TodayHabit, TodayItem, TodayPageData, TodayTask } from "@/features/today/types";
import type { ActionResult } from "@/lib/actions/result";
import { useOptimisticAction } from "@/lib/actions/use-optimistic-action";
import { useUserSettings } from "@/lib/time/user-settings";

/**
 * Every mutation `/today` can make, over one optimistic overlay.
 *
 * `useOptimisticAction`'s contract is one action per hook and this page has
 * four mutations over one object, so it takes the arrangement
 * `use-task-mutations.ts` established: a single hook whose `action` dispatches
 * on the patch and whose `optimistic` is the pure reducer in `optimistic.ts`.
 * Four `useOptimistic` calls over the same page would each hold a different
 * view of it, and the page can only render one.
 *
 * Rollback is the mechanism's, not this file's: on failure the transition
 * settles against unchanged props and React discards the overlay. No revert is
 * written anywhere in this feature, which is precisely why there is none to get
 * wrong (Domain Rule 11).
 *
 * Every call sends an id and, at most, a wall-clock span. No XP amount, no
 * completion timestamp, no habit total: those are the database's
 * (Domain Rules 6, 15).
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
        /*
         * A virtual occurrence has no row to stamp, so it has nothing to
         * complete. The control is not offered for one (`canComplete` in
         * `today-item.tsx`); this guard is the second half of that promise.
         */
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
              // The mirror of `alsoCompleteTask`: un-completing a block that
              // completed its task reopens the task, because the two were one
              // user action and it has to be reversible (Domain Rule 13).
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
        // What one press means — the day for a boolean habit, a top-up to the
        // day's or the week's target for an amount one — is decided once in
        // the domain, and the habits page asks the same function.
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

      reschedule: (entry, span) => {
        const { item } = entry;
        // One rule for wall clock → instants, and it is not this file's
        // (docs/DOMAIN_RULES.md §19). The server applies the same one to the
        // same span, so the overlay and the written row agree on the two days a
        // year the rule exists for.
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
              ? // Moving one occurrence writes an override keyed to the date the
                // *rule* produced, never the date it is moving to.
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
