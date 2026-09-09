import {
  addDays,
  endOfDay,
  formatDuration,
  formatLocalDate,
  localDateOf,
  startOfDay,
} from "../time";
import type { Instant, LocalDate, Minutes } from "../types";
import { remainingMinutesOf, weekCapacity } from "./capacity";
import {
  busyIntervals,
  clipIntervals,
  compareInstants,
  intersectIntervals,
  intervalMinutes,
  occupiesTime,
  subtractIntervals,
  totalMinutes,
  workingIntervalsOn,
} from "./intervals";
import type {
  Commitment,
  InstantInterval,
  PlanningContext,
  PlanningTask,
  PlanningWarning,
  WeekCapacity,
} from "./types";

type OverlapWarning = Extract<PlanningWarning, { kind: "overlap" }>;
type PastDeadlineWarning = Extract<PlanningWarning, { kind: "past-deadline" }>;
type OverCapacityWarning = Extract<PlanningWarning, { kind: "over-capacity" }>;
type InsufficientTimeWarning = Extract<PlanningWarning, { kind: "insufficient-time" }>;

/**
 * Conflict detection: the four warnings specs/05-week-planning.md names —
 * overlap, past deadline, over capacity, insufficient time
 * (docs/SCHEDULING.md "Capacity and conflicts").
 *
 * Every warning is information. Nothing here decides anything, blocks
 * anything or ranks anything; the user is allowed to double-book a morning
 * or plan twelve hours on a Tuesday, and the drawer's job is to make sure
 * that does not happen by accident. Accordingly the copy `describeWarning`
 * produces states a fact about the schedule — an amount, a date, a title —
 * and never a verdict about the person (Domain Rule 7).
 *
 * The list is deterministic: the same input gives the same warnings in the
 * same order, whatever order the commitments and tasks arrived in, so a row
 * keyed by `warningKey` never jumps as an optimistic block lands.
 */

export interface ConflictInput {
  context: PlanningContext;
  commitments: readonly Commitment[];
  tasks: readonly PlanningTask[];
  /**
   * The current instant, for the insufficient-time check, which counts open
   * working time from now to the deadline. Null (before hydration) counts from
   * the start of today instead.
   */
  now: Instant | null;
}

/* -------------------------------------------------------------------------- */
/* Over-capacity tolerance                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A day is over capacity when its planned minutes exceed its working minutes
 * by more than the tolerance — "substantially exceeds", in the spec's words.
 * A quarter of the window, but never less than an hour: an eight-hour day
 * warns above ten hours planned, and a day off (no window) warns above one
 * hour, so a Saturday errand does not trip it and a Saturday of work does.
 */
export const OVER_CAPACITY_MIN_TOLERANCE_MINUTES: Minutes = 60;
export const OVER_CAPACITY_TOLERANCE_RATIO = 0.25;

/** `max(60, round(0.25 × working))` — the slack allowed before a window counts as exceeded. */
export function overCapacityTolerance(workingMinutes: Minutes): Minutes {
  return Math.max(
    OVER_CAPACITY_MIN_TOLERANCE_MINUTES,
    Math.round(OVER_CAPACITY_TOLERANCE_RATIO * workingMinutes),
  );
}

/** Strictly above the window plus its tolerance; exactly at the edge does not warn. */
export function exceedsWorkingWindow(plannedMinutes: Minutes, workingMinutes: Minutes): boolean {
  return plannedMinutes > workingMinutes + overCapacityTolerance(workingMinutes);
}

/* -------------------------------------------------------------------------- */
/* Detection                                                                  */
/* -------------------------------------------------------------------------- */

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * One warning per pair of occupying commitments whose spans intersect. Two
 * events count too — that is a double booking.
 *
 * A sweep: sorted by start (ties by id), each block is compared only with the
 * blocks that start before it ends, so the earlier-starting block is always
 * `first` and the scan is O(n log n + pairs).
 */
function overlapWarnings(
  commitments: readonly Commitment[],
  tz: PlanningContext["timezone"],
): OverlapWarning[] {
  const occupying = commitments
    .filter(occupiesTime)
    .sort((a, b) => compareInstants(a.startAt, b.startAt) || compareStrings(a.id, b.id));

  const warnings: OverlapWarning[] = [];
  for (let i = 0; i < occupying.length; i += 1) {
    const first = occupying[i];
    if (first === undefined) continue;
    for (let j = i + 1; j < occupying.length; j += 1) {
      const second = occupying[j];
      if (second === undefined || second.startAt >= first.endAt) break;
      const common = intersectIntervals(first, second);
      if (common === null) continue;
      warnings.push({
        kind: "overlap",
        date: localDateOf(second.startAt, tz),
        first: { id: first.id, title: first.title },
        second: { id: second.id, title: second.title },
        overlapMinutes: intervalMinutes(common),
      });
    }
  }

  return warnings.sort(
    (a, b) =>
      compareStrings(a.date, b.date) ||
      compareStrings(a.first.id, b.first.id) ||
      compareStrings(a.second.id, b.second.id),
  );
}

/**
 * Every work block of an open task that starts on a local date after the
 * task's due date. The block's execution state does not matter — a block
 * worked after the deadline was still scheduled after it — but a completed
 * task's blocks are settled and say nothing.
 */
function pastDeadlineWarnings(
  commitments: readonly Commitment[],
  tz: PlanningContext["timezone"],
): PastDeadlineWarning[] {
  const warnings: PastDeadlineWarning[] = [];
  for (const commitment of commitments) {
    if (commitment.kind !== "work" || commitment.taskId === null) continue;
    if (commitment.taskDueDate === null || commitment.taskCompletedAt !== null) continue;
    const date = localDateOf(commitment.startAt, tz);
    if (date <= commitment.taskDueDate) continue;
    warnings.push({
      kind: "past-deadline",
      block: { id: commitment.id, title: commitment.title },
      taskId: commitment.taskId,
      dueDate: commitment.taskDueDate,
      date,
    });
  }

  return warnings.sort(
    (a, b) => compareStrings(a.date, b.date) || compareStrings(a.block.id, b.block.id),
  );
}

/**
 * Each day whose planned minutes exceed its working window by more than the
 * tolerance, in range order, then the range as a whole against the week's
 * totals. Both may fire: a week can be within its total and still have one
 * day far over, and a week can be over without any single day being so.
 */
function overCapacityWarnings(capacity: WeekCapacity): OverCapacityWarning[] {
  const warnings: OverCapacityWarning[] = [];
  for (const day of capacity.days) {
    if (exceedsWorkingWindow(day.plannedMinutes, day.workingMinutes)) {
      warnings.push({
        kind: "over-capacity",
        date: day.date,
        plannedMinutes: day.plannedMinutes,
        workingMinutes: day.workingMinutes,
      });
    }
  }
  if (exceedsWorkingWindow(capacity.plannedMinutes, capacity.workingMinutes)) {
    warnings.push({
      kind: "over-capacity",
      date: null,
      plannedMinutes: capacity.plannedMinutes,
      workingMinutes: capacity.workingMinutes,
    });
  }
  return warnings;
}

/**
 * Open working minutes from `from` to the end of `dueDate`: the working
 * windows of every day from `start` to `dueDate` inclusive, with nothing
 * before `from` counted, minus the merged busy list.
 */
function openMinutesBefore(
  dueDate: LocalDate,
  start: LocalDate,
  from: Instant,
  context: PlanningContext,
  busy: readonly InstantInterval[],
): Minutes {
  const working: InstantInterval[] = [];
  for (let date = start; date <= dueDate; date = addDays(date, 1)) {
    working.push(...workingIntervalsOn(date, context.workingHours, context.timezone));
  }
  const window: InstantInterval = { startAt: from, endAt: endOfDay(dueDate, context.timezone) };
  return totalMinutes(subtractIntervals(clipIntervals(working, window), busy));
}

/**
 * Tasks whose remaining estimate is larger than the open working time left
 * before their deadline.
 *
 * Bounded to due dates the range can see. The engine only holds the range's
 * commitments, so for a deadline after the last day — or before the first,
 * when a future week is being planned — it cannot tell how much of the time
 * between here and there is free, and would either invent a shortage (no
 * working days to count) or invent capacity (working days with no blocks in
 * them). It says nothing instead. Overdue tasks never warn either: their
 * state is a section of the drawer, not a conflict about the plan.
 */
function insufficientTimeWarnings(
  tasks: readonly PlanningTask[],
  commitments: readonly Commitment[],
  context: PlanningContext,
  now: Instant | null,
): InsufficientTimeWarning[] {
  const firstDay = context.days[0];
  const lastDay = context.days[context.days.length - 1];
  if (firstDay === undefined || lastDay === undefined) return [];

  const { timezone: tz, today } = context;
  const from = now ?? startOfDay(today, tz);
  const start = today > firstDay ? today : firstDay;
  const busy = busyIntervals(commitments);

  const seen = new Set<string>();
  const warnings: InsufficientTimeWarning[] = [];
  for (const task of tasks) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);

    const dueDate = task.dueDate;
    if (dueDate === null || dueDate < today || dueDate < firstDay || dueDate > lastDay) continue;

    const remainingMinutes = remainingMinutesOf(task, commitments);
    if (remainingMinutes <= 0) continue;

    const availableMinutes = openMinutesBefore(dueDate, start, from, context, busy);
    if (remainingMinutes <= availableMinutes) continue;

    warnings.push({
      kind: "insufficient-time",
      taskId: task.id,
      title: task.title,
      dueDate,
      remainingMinutes,
      availableMinutes,
    });
  }

  return warnings.sort(
    (a, b) => compareStrings(a.dueDate, b.dueDate) || compareStrings(a.taskId, b.taskId),
  );
}

/**
 * Every warning for the range, in a stable order: all overlaps (by date,
 * first id, second id), then past deadlines (by date, block id), then
 * over-capacity days in range order with the range-level one last, then
 * insufficient time (by due date, task id).
 */
export function detectConflicts(input: ConflictInput): PlanningWarning[] {
  const { context, commitments, tasks, now } = input;
  return [
    ...overlapWarnings(commitments, context.timezone),
    ...pastDeadlineWarnings(commitments, context.timezone),
    ...overCapacityWarnings(weekCapacity({ context, commitments, tasks })),
    ...insufficientTimeWarnings(tasks, commitments, context, now),
  ];
}

/* -------------------------------------------------------------------------- */
/* Keys and copy                                                              */
/* -------------------------------------------------------------------------- */

/** A stable key for a list row: the kind plus what the warning points at. */
export function warningKey(warning: PlanningWarning): string {
  switch (warning.kind) {
    case "overlap":
      return `overlap:${warning.first.id}:${warning.second.id}`;
    case "past-deadline":
      return `past-deadline:${warning.block.id}`;
    case "over-capacity":
      return `over-capacity:${warning.date ?? "range"}`;
    case "insufficient-time":
      return `insufficient-time:${warning.taskId}`;
  }
}

/** `"Tue Sep 8"` — weekday and month-day, the one date shape every warning uses. */
function dayLabel(date: LocalDate): string {
  return `${formatLocalDate(date, "weekday")} ${formatLocalDate(date, "monthDay")}`;
}

/**
 * One neutral sentence: a fact about the schedule, never a judgement about
 * the person. Amounts via `formatDuration`, dates via `dayLabel`; no "you",
 * no verdict, no adjective about the day.
 */
export function describeWarning(warning: PlanningWarning): string {
  switch (warning.kind) {
    case "overlap":
      return `${warning.first.title} and ${warning.second.title} overlap by ${formatDuration(
        warning.overlapMinutes,
      )} on ${dayLabel(warning.date)}.`;
    case "past-deadline":
      return `${warning.block.title} is scheduled on ${dayLabel(warning.date)}, after its ${dayLabel(
        warning.dueDate,
      )} deadline.`;
    case "over-capacity": {
      const subject = warning.date === null ? "This range" : dayLabel(warning.date);
      const planned = formatDuration(warning.plannedMinutes);
      return warning.workingMinutes === 0
        ? `${subject} has ${planned} planned and no working hours configured.`
        : `${subject} has ${planned} planned against ${formatDuration(
            warning.workingMinutes,
          )} of working hours.`;
    }
    case "insufficient-time":
      return `${warning.title}: ${formatDuration(warning.remainingMinutes)} still to schedule, ${formatDuration(
        warning.availableMinutes,
      )} of working hours open before the ${dayLabel(warning.dueDate)} deadline.`;
  }
}
