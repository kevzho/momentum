import { intervalOfSlot } from "@momentum/core/scheduling";
import { nowInstant } from "@momentum/core/time";
import type { IanaTimeZone, Instant, ProjectColor, Uuid } from "@momentum/core/types";

import { KIND_DEFAULT_COLOR } from "@/features/calendar/projection";
import type { CalendarItem, DaySpan, PlanTask } from "@/features/calendar/types";

/**
 * The calendar's optimistic overlay as a pure reducer: one overlay over one
 * list, every mutation a patch. Discarded on settle (including failure), so
 * rollback is automatic. Instants built here are display-only; the server
 * recomputes them from the same `(date, minutes)` pair.
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
  /** Every occurrence of a series leaves together. */
  | { kind: "delete-series"; seriesId: Uuid }
  /** A write with no overlay: the series' new expansion arrives with the refresh. */
  | { kind: "none" }
  | { kind: "completion"; id: string; completed: boolean; alsoTask: boolean };

export function applyPatch(
  items: readonly CalendarItem[],
  patch: CalendarPatch,
  timezone: IanaTimeZone,
): CalendarItem[] {
  switch (patch.kind) {
    case "create":
      // Client-generated ids: the optimistic and persisted rows share a key,
      // so a retry replaces in place rather than duplicating.
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
              // Only an event owns its title; work and habit blocks display their parent's.
              title: item.kind === "event" ? patch.title : item.title,
              description: patch.description,
              ownColor: patch.color,
              color: patch.color ?? item.color,
            }
          : item,
      );

    case "delete":
      return items.filter((item) => item.id !== patch.id);

    case "delete-series":
      return items.filter((item) => item.occurrence?.seriesId !== patch.seriesId);

    case "none":
      return [...items];

    case "completion": {
      // One instant for the whole patch, so siblings agree on when the task changed.
      const completedAt = patch.completed ? nowInstant() : null;
      // The task's state changes on every block of that task, as the server
      // does; rewriting only the toggled block would leave siblings stale.
      const taskId = patch.alsoTask
        ? (items.find((item) => item.id === patch.id)?.work?.taskId ?? null)
        : null;

      return items.map((item) => {
        if (item.id === patch.id) return complete(item, patch, completedAt);
        const work = item.work;
        if (taskId === null || work === null || work.taskId !== taskId) return item;
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

  const taskCompletedAt = patch.alsoTask ? completedAt : item.work.taskCompletedAt;

  return {
    ...item,
    completedAt,
    work: { ...item.work, taskCompletedAt },
  };
}

// `intervalOfSlot` rather than two `fromLocal` calls: a span straddling the
// far edge of a spring-forward gap would otherwise resolve inverted and be
// dropped by `splitByLocalDay`. Must match the server's `spanInstants`.
function instantsFor(span: DaySpan, timezone: IanaTimeZone) {
  return intervalOfSlot(span, timezone);
}

/** The optimistic row for a block created on empty space; a full `CalendarItem`, not a placeholder. */
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
      // Whether this is the task's last incomplete block is the server's answer;
      // guessing would mislabel the completion control until the refresh.
      blockCount: 0,
      completesTask: false,
    },
    habitId: null,
    habitRecordable: false,
  };
}
