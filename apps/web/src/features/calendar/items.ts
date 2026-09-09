import { addDays, localDateOf } from "@momentum/core/time";
import type {
  CalendarBlock,
  IanaTimeZone,
  Instant,
  LocalDate,
  Occurrence,
  Project,
  ProjectColor,
  Task,
  Uuid,
} from "@momentum/core/types";

import { KIND_DEFAULT_COLOR } from "@/features/calendar/projection";
import type { CalendarItem, WorkBlockContext } from "@/features/calendar/types";

/**
 * Rows and expanded occurrences → `CalendarItem`, shared by the calendar and
 * Today so both resolve titles, colours and completion semantics identically.
 * Pure: lookup shapes are declared structurally because this is not a
 * data-access module.
 */

/** Work blocks a task owns, across all weeks, and how many are still outstanding. */
export interface TaskBlockCounts {
  total: number;
  incomplete: number;
}

/** What a habit block is labelled and coloured with. */
export interface HabitLabel {
  name: string;
  color: ProjectColor | null;
}

export interface ItemContext {
  tasksById: ReadonlyMap<Uuid, Task>;
  projectsById: ReadonlyMap<Uuid, Project>;
  blockCounts: ReadonlyMap<Uuid, TaskBlockCounts>;
  habitLabels: ReadonlyMap<Uuid, HabitLabel>;
  timezone: IanaTimeZone;
  /** Today in the profile timezone, resolved once per request. */
  today: LocalDate;
}

/**
 * A stored block, resolved for rendering. Work and habit blocks take their
 * title from the parent (`blocks_event_title_chk` requires one of events only).
 */
export function itemFromBlock(block: CalendarBlock, context: ItemContext): CalendarItem {
  const task = block.kind === "work" ? (context.tasksById.get(block.taskId) ?? null) : null;
  const habit = block.kind === "habit" ? (context.habitLabels.get(block.habitId) ?? null) : null;
  const project = task?.projectId ? (context.projectsById.get(task.projectId) ?? null) : null;

  return {
    id: block.id,
    blockId: block.id,
    kind: block.kind,
    title: block.title !== "" ? block.title : (task?.title ?? habit?.name ?? ""),
    description: block.description,
    startAt: block.startAt,
    endAt: block.endAt,
    allDay: block.allDay,
    ownColor: block.color,
    color: block.color ?? project?.color ?? habit?.color ?? KIND_DEFAULT_COLOR[block.kind],
    completedAt: block.completedAt,
    occurrence: null,
    work: task === null ? null : workContext(block, task, context.blockCounts.get(task.id)),
    habitId: block.habitId,
    habitRecordable:
      block.kind === "habit" && isRecordable(block.startAt, context.timezone, context.today),
  };
}

/**
 * Whether a habit block's local date is yesterday, today or tomorrow in the
 * profile timezone — the window `record_habit_completion` enforces; must match it.
 */
export function isRecordable(startAt: Instant, timezone: IanaTimeZone, today: LocalDate): boolean {
  const date = localDateOf(startAt, timezone);
  return date >= addDays(today, -1) && date <= addDays(today, 1);
}

/**
 * `completesTask` is true when completing this block would leave the task with
 * no outstanding blocks (Domain Rule 13); an already-complete block or task
 * answers false. Counts are deliberately unbounded by the displayed range.
 */
export function workContext(
  block: CalendarBlock,
  task: Task,
  counts: TaskBlockCounts | undefined,
): WorkBlockContext {
  const incomplete = counts?.incomplete ?? 0;
  return {
    taskId: task.id,
    taskTitle: task.title,
    taskCompletedAt: task.completedAt,
    taskDueDate: task.dueDate,
    taskEstimatedMinutes: task.estimatedMinutes,
    blockCount: counts?.total ?? 0,
    completesTask: block.completedAt === null && task.completedAt === null && incomplete === 1,
  };
}

/**
 * One expanded instance of a recurring event. `id` is `${seriesId}:${occurrenceDate}`
 * and survives a move, so React keys hold still; `blockId` is null until the
 * occurrence has an override row.
 */
export function itemFromOccurrence(occurrence: Occurrence): CalendarItem {
  const source = occurrence.override ?? occurrence.series;

  return {
    id: occurrence.id,
    blockId: occurrence.override?.id ?? null,
    kind: "event",
    title: source.title,
    description: source.description,
    startAt: occurrence.startAt,
    endAt: occurrence.endAt,
    allDay: source.allDay,
    ownColor: source.color,
    color: source.color ?? KIND_DEFAULT_COLOR.event,
    completedAt: occurrence.override?.completedAt ?? null,
    occurrence: { seriesId: occurrence.seriesId, occurrenceDate: occurrence.occurrenceDate },
    work: null,
    habitId: null,
    habitRecordable: false,
  };
}
