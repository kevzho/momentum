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
 * Rows and expanded occurrences → `CalendarItem`, the shape every surface in
 * the product renders a block as.
 *
 * This was inside `features/calendar/queries.ts` until Phase 9 needed the same
 * answers on `/today`. It is not a second implementation: it is the one
 * implementation, moved to where two reads can share it. Resolving a block's
 * title, its colour, whether completing it also completes its task, and whether
 * a habit block's date is one the database will record are all decisions with
 * exactly one correct answer (Domain Rule 13, docs/DOMAIN_RULES.md §19), and
 * two pages that computed them separately would eventually disagree — which is
 * a block whose control promises something the database refuses.
 *
 * Pure: it takes rows and lookups and returns view models. The reads stay in
 * `queries.ts`, which is also why the two lookup shapes below are declared
 * structurally rather than imported from `@momentum/db` — data access lives in
 * the designated modules and this is not one of them
 * (docs/ARCHITECTURE.md §6, and the lint rule that enforces it).
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
  /** Today in the profile timezone, resolved once per request (Domain Rule 4). */
  today: LocalDate;
}

/**
 * A stored block, resolved for rendering.
 *
 * Title comes from the parent for the two kinds that have one: a work block
 * displays its task's title and a habit block its habit's name, which is why
 * `blocks_event_title_chk` requires a title of events alone. `blockId` equals
 * `id` here — only a virtual occurrence has no row to mutate.
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
 * Whether a habit block's own local date is one the database will record a
 * completion for: yesterday, today or tomorrow in the profile timezone.
 *
 * The same window `record_habit_completion` enforces, resolved here so the
 * control is offered exactly where it works. Both sides compute it in the
 * user's timezone and from a `today` the request resolved once, so the button
 * the user sees and the row the function writes cannot disagree
 * (Domain Rule 4).
 */
export function isRecordable(startAt: Instant, timezone: IanaTimeZone, today: LocalDate): boolean {
  const date = localDateOf(startAt, timezone);
  return date >= addDays(today, -1) && date <= addDays(today, 1);
}

/**
 * Domain Rule 13's decision, made once on the server.
 *
 * The control on a work block is labelled by what it will do: the task's only
 * block, or its last incomplete one, reads "Complete task" and completes both;
 * anything else reads "Done with this block". The two phrasings collapse into
 * one condition — completing this block would leave the task with no
 * outstanding blocks — because "the only block" is the case where that count is
 * one to begin with.
 *
 * A block that is already complete, or whose task is, answers `false`: there is
 * nothing left for completing it to also do, and the control on it is an undo.
 * The counts are unbounded by any displayed range on purpose.
 *
 * The deadline and the estimate ride along for the planner and for Today's
 * risks: a block after its task's due date is a warning, and the estimate is
 * what coverage is measured against. Both are the task's, copied rather than
 * joined so no consumer needs a second lookup to answer a question about one
 * block.
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
 * One expanded instance of a recurring event.
 *
 * `id` is the rule's identity `${seriesId}:${occurrenceDate}` and survives the
 * user dragging the occurrence somewhere else, so React keys and optimistic
 * state hold still. `blockId` is null until the occurrence has an override row
 * of its own — which is exactly the difference between `rescheduleBlock` and
 * `rescheduleOccurrence`, and why the type carries it.
 *
 * A series is never an item itself: only its occurrences are on the grid.
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
    // An event belongs to no project, so there is nothing between its own
    // colour and the kind default.
    color: source.color ?? KIND_DEFAULT_COLOR.event,
    completedAt: occurrence.override?.completedAt ?? null,
    occurrence: { seriesId: occurrence.seriesId, occurrenceDate: occurrence.occurrenceDate },
    work: null,
    habitId: null,
    habitRecordable: false,
  };
}
