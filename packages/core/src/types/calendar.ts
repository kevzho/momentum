import type { ProjectColor } from "./project";
import type { IanaTimeZone, Instant, LocalDate, Uuid, Weekday } from "./scalars";

/** Every time-bound thing on the board is a calendar block: one table, one overlap check. */
export const BLOCK_KINDS = ["event", "work", "habit"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

export const RECURRENCE_FREQUENCIES = ["daily", "weekly"] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

/**
 * Occurrences keep the wall-clock time of the series in `timezone`, so a 09:00
 * class stays at 09:00 across DST. Only `event` blocks may recur.
 */
export interface Recurrence {
  freq: RecurrenceFrequency;
  /** Every N days/weeks. `1` = every. */
  interval: number;
  /** Weekly only; null means "the weekday of the first occurrence". */
  byWeekday: Weekday[] | null;
  /** Last occurrence date (inclusive), in `timezone`. */
  until: LocalDate | null;
  /** Alternative to `until`: total number of occurrences. */
  count: number | null;
  /** Timezone the wall-clock schedule is defined in. Fixed at creation. */
  timezone: IanaTimeZone;
}

/** What a user chooses in the editor; the server fixes the series timezone at creation. */
export type RecurrenceRule = Omit<Recurrence, "timezone">;

interface BlockBase {
  id: Uuid;
  userId: Uuid;
  title: string;
  description: string | null;
  startAt: Instant;
  endAt: Instant;
  allDay: boolean;
  /** Explicit color; null inherits from the linked project or the kind default. */
  color: ProjectColor | null;
  /** Set when the block was executed. For work blocks this does NOT complete the task (Domain Rule 2). */
  completedAt: Instant | null;
  createdAt: Instant;
  updatedAt: Instant;
}

/** A calendar block not backed by a task: class, meeting, appointment. The only kind that can recur. */
export interface EventBlock extends BlockBase {
  kind: "event";
  taskId: null;
  habitId: null;
  /** Present on the series row; null on plain events and on override rows. */
  recurrence: Recurrence | null;
  /** Override rows point at their series. */
  seriesId: Uuid | null;
  /** Override rows record which occurrence (by its date in the series timezone) they replace. */
  occurrenceDate: LocalDate | null;
  /** An override that removes its occurrence. */
  cancelled: boolean;
}

/** Reserved time allocated toward a task. A task owns 0..n of these. */
export interface WorkBlock extends BlockBase {
  kind: "work";
  taskId: Uuid;
  habitId: null;
  recurrence: null;
  seriesId: null;
  occurrenceDate: null;
  cancelled: false;
}

/** Reserved time generated from a habit's schedule for a specific week. */
export interface HabitBlock extends BlockBase {
  kind: "habit";
  taskId: null;
  habitId: Uuid;
  recurrence: null;
  seriesId: null;
  occurrenceDate: null;
  cancelled: false;
}

export type CalendarBlock = EventBlock | WorkBlock | HabitBlock;

/**
 * A single expanded instance of a recurring event. Virtual until the user
 * edits it, at which point an override row is written.
 */
export interface Occurrence {
  /** Stable id `${seriesId}:${occurrenceDate}` for keys and optimistic state. */
  id: string;
  seriesId: Uuid;
  occurrenceDate: LocalDate;
  startAt: Instant;
  endAt: Instant;
  /** The series row this occurrence was expanded from. */
  series: EventBlock;
  /** The override row, if the user edited this occurrence. */
  override: EventBlock | null;
}
