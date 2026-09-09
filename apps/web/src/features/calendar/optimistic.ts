import { intervalOfSlot } from "@momentum/core/scheduling";
import { nowInstant } from "@momentum/core/time";
import type { IanaTimeZone, Instant, ProjectColor, Uuid } from "@momentum/core/types";

import { KIND_DEFAULT_COLOR } from "@/features/calendar/projection";
import type { CalendarItem, DaySpan, PlanTask } from "@/features/calendar/types";

/**
 * The optimistic overlay for the calendar, as a pure reducer.
 *
 * docs/ARCHITECTURE.md §8 gives one mechanism for optimistic mutation, and its
 * example shows one hook per action. The calendar has seven, all over the same
 * list, and seven `useOptimistic` calls over one array would each hold a
 * different view of it — the grid can only render one. So the board holds a
 * single overlay and every mutation describes itself as a patch.
 *
 * Everything here is pure and total: given the server's items and a patch, the
 * list the user should see while the request is in flight. When the action
 * settles, `refresh()` re-renders with server truth and the overlay is
 * discarded — including on failure, which is exactly what makes rollback
 * automatic rather than something each call site has to remember
 * (Domain Rule 11).
 *
 * Instants built here come from the client's clock and the profile timezone,
 * and are display-only: the server recomputes them from the same
 * `(date, minutes)` pair and its value replaces this one on reconcile.
 */

export type CalendarPatch =
  | { kind: "create"; item: CalendarItem }
  | { kind: "reschedule"; id: string; span: DaySpan }
  | {
      kind: "content";
      id: string;
      title: string;
      description: string | null;
      color: ProjectColor | null;
    }
  | { kind: "delete"; id: string }
  | { kind: "completion"; id: string; completed: boolean; alsoTask: boolean };

export function applyPatch(
  items: readonly CalendarItem[],
  patch: CalendarPatch,
  timezone: IanaTimeZone,
): CalendarItem[] {
  switch (patch.kind) {
    case "create":
      // Client-generated ids (Domain Rule 17) mean the optimistic row and the
      // persisted row share a key, so a retry cannot produce a duplicate and
      // the server's version simply replaces this one in place.
      return items.some((item) => item.id === patch.item.id)
        ? items.map((item) => (item.id === patch.item.id ? patch.item : item))
        : [...items, patch.item];

    case "reschedule":
      return items.map((item) =>
        item.id === patch.id ? { ...item, ...instantsFor(patch.span, timezone) } : item,
      );

    case "content":
      return items.map((item) =>
        item.id === patch.id
          ? {
              ...item,
              // Only an event owns its title. A work block displays its task's
              // and a habit block its habit's, so an edit to either never
              // rewrites the block's own (Domain Rules 1 and 2) — which is also
              // why the board sends no `title` to `updateBlock` for them.
              title: item.kind === "event" ? patch.title : item.title,
              description: patch.description,
              ownColor: patch.color,
              color: patch.color ?? item.color,
            }
          : item,
      );

    case "delete":
      return items.filter((item) => item.id !== patch.id);

    case "completion": {
      // One instant for the whole patch, so the toggled block and its siblings
      // cannot disagree about when the task changed state.
      const completedAt = patch.completed ? nowInstant() : null;
      /*
       * When the task changes with the block, it changes for every block of
       * that task — Domain Rule 13 is a statement about the *task*: its
       * incomplete blocks render as settled and count as free time while it is
       * complete, and un-completing it restores all of them. The server does
       * that to the whole task; rewriting only the toggled block would leave
       * the others drawn as settled, announced as ", task completed" and
       * subtracted from capacity until the refresh landed.
       */
      const taskId = patch.alsoTask
        ? (items.find((item) => item.id === patch.id)?.work?.taskId ?? null)
        : null;

      return items.map((item) => {
        if (item.id === patch.id) return complete(item, patch, completedAt);
        const work = item.work;
        if (taskId === null || work === null || work.taskId !== taskId) return item;
        // The task's state only: a sibling's own `completedAt` is its own.
        return { ...item, work: { ...work, taskCompletedAt: completedAt } };
      });
    }
  }
}

function complete(
  item: CalendarItem,
  patch: Extract<CalendarPatch, { kind: "completion" }>,
  completedAt: Instant | null,
): CalendarItem {
  if (item.work === null) return { ...item, completedAt };

  // Domain Rule 13's two directions, previewed together: the control that
  // completes a task also reopens it, and the block reads as settled or not in
  // the same frame as its own state changes.
  const taskCompletedAt = patch.alsoTask ? completedAt : item.work.taskCompletedAt;

  return {
    ...item,
    completedAt,
    work: { ...item.work, taskCompletedAt },
  };
}

/**
 * A wall-clock span, resolved to instants in the profile timezone.
 *
 * `intervalOfSlot` rather than two `fromLocal` calls of our own, because the
 * rule has a second half: both ends go through `fromLocal`, *except* for the
 * one span that cannot resolve in order — one straddling the far edge of a
 * spring-forward gap, where the start moves forward further than the end —
 * which keeps its drawn length instead. Writing the first half here and
 * omitting the second is how the optimistic row ends up inverted, dropped by
 * `splitByLocalDay` and invisible, while the row the server writes is a normal
 * block. The engine and the server's `spanInstants` already run this function's
 * rule (Domain Rule 5); a third copy of it is a third thing to keep in step.
 */
function instantsFor(span: DaySpan, timezone: IanaTimeZone) {
  return intervalOfSlot(span, timezone);
}

/**
 * The optimistic row for a block created on empty space.
 *
 * It is a real `CalendarItem` rather than a placeholder shape, so the grid, the
 * overlap layout and the block visual all treat it exactly like a persisted
 * block — an optimistic row that renders differently is a second rendering path
 * to keep in step.
 */
export function optimisticEvent(input: {
  id: Uuid;
  title: string;
  description: string | null;
  color: ProjectColor | null;
  span: DaySpan;
  timezone: IanaTimeZone;
}): CalendarItem {
  return {
    id: input.id,
    blockId: input.id,
    kind: "event",
    title: input.title,
    description: input.description,
    ...instantsFor(input.span, input.timezone),
    allDay: false,
    ownColor: input.color,
    color: input.color ?? KIND_DEFAULT_COLOR.event,
    completedAt: null,
    occurrence: null,
    work: null,
    habitId: null,
    habitRecordable: false,
  };
}

/** The optimistic work block for a task dropped or scheduled onto the grid. */
export function optimisticWorkBlock(input: {
  id: Uuid;
  task: PlanTask;
  span: DaySpan;
  timezone: IanaTimeZone;
}): CalendarItem {
  return {
    id: input.id,
    blockId: input.id,
    kind: "work",
    // A work block shows its task's title; it has none of its own, which is why
    // the two can never drift (Domain Rule 2).
    title: input.task.title,
    description: null,
    ...instantsFor(input.span, input.timezone),
    allDay: false,
    ownColor: null,
    color: input.task.projectColor ?? KIND_DEFAULT_COLOR.work,
    completedAt: null,
    occurrence: null,
    work: {
      taskId: input.task.id,
      taskTitle: input.task.title,
      taskCompletedAt: null,
      taskDueDate: input.task.dueDate,
      taskEstimatedMinutes: input.task.estimatedMinutes,
      // The block being created is, by definition, an incomplete one. Whether it
      // is the *last* incomplete one is the server's answer, and it arrives with
      // the refresh; assuming either way here would put a "Complete task" label
      // on a block that is not the task's last.
      blockCount: 0,
      completesTask: false,
    },
    habitId: null,
    habitRecordable: false,
  };
}
