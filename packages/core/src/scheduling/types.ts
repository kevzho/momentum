import type {
  BlockKind,
  IanaTimeZone,
  Instant,
  LocalDate,
  Minutes,
  TimeWindow,
  Uuid,
  Weekday,
  WorkingHours,
} from "../types";

/**
 * The contracts of `@momentum/core/scheduling`. Two quantities must not be
 * confused: elapsed minutes (intervals carry instants; capacity is measured in
 * them) and wall-clock minutes from midnight (`SlotSpan`). They differ by an
 * hour on two days a year.
 */

/** A calendar block as the scheduler sees it. `occupiesTime` in `intervals.ts` is the one place Domain Rule 13 is applied. */
export interface Commitment {
  id: string;
  kind: BlockKind;
  title: string;
  startAt: Instant;
  endAt: Instant;
  allDay: boolean;
  completedAt: Instant | null;
  /** Work blocks: the task the block reserves time for. Null for events and habit blocks. */
  taskId: Uuid | null;
  /** The task's deadline, for past-deadline detection. Null for other kinds or an undated task. */
  taskDueDate: LocalDate | null;
  /** Set when the block's task is complete; such a block is settled and occupies no time. */
  taskCompletedAt: Instant | null;
}

/**
 * A task competing for the range. The range's own work blocks are among the
 * `Commitment`s and are summed live; `scheduledOutsideMinutes` adds only what
 * lies outside, or an optimistic block would be counted twice.
 */
export interface PlanningTask {
  id: Uuid;
  title: string;
  /** User intent; never an actual. Null means "no estimate". */
  estimatedMinutes: Minutes | null;
  /** A deadline, never a schedule. */
  dueDate: LocalDate | null;
  /** Elapsed minutes of the task's work blocks that lie outside the planning range. */
  scheduledOutsideMinutes: Minutes;
}

/** The settings every planning question resolves against. */
export interface PlanningContext {
  timezone: IanaTimeZone;
  workingHours: WorkingHours;
  /** Preferred deep-focus windows; empty when the user has configured none. */
  focusWindows: readonly TimeWindow[];
  /** The planning range in order: seven local dates for a week, one in day view. */
  days: readonly LocalDate[];
  /** Today in the profile timezone. Days before it are the past. */
  today: LocalDate;
}

/** A half-open span of instants `[startAt, endAt)`. */
export interface InstantInterval {
  startAt: Instant;
  endAt: Instant;
}

/**
 * An interval with its wall-clock reading on the local day it starts.
 * `endMinutes` may exceed 1440 past midnight (the actions' `endMinuteOfDay`
 * allows up to 2880) and is a clock reading, not `startMinutes + elapsed`.
 */
export interface DayInterval extends InstantInterval {
  date: LocalDate;
  startMinutes: Minutes;
  endMinutes: Minutes;
}

/** A wall-clock span on a day: the shape every calendar action takes (`features/calendar/types.ts` `DaySpan`). */
export interface SlotSpan {
  date: LocalDate;
  startMinutes: Minutes;
  endMinutes: Minutes;
}

/** One day's load against its working window. Every number is elapsed minutes. */
export interface DayWorkload {
  date: LocalDate;
  weekday: Weekday;
  /** Elapsed minutes of every commitment that occupies time on the day. */
  plannedMinutes: Minutes;
  /** The part of `plannedMinutes` that is work and habit blocks. */
  workMinutes: Minutes;
  /** The part of `plannedMinutes` that is events. */
  eventMinutes: Minutes;
  /** Elapsed minutes inside the day's configured working windows. 0 on a day off. */
  workingMinutes: Minutes;
  /** Working minutes no commitment covers. Never negative. */
  availableMinutes: Minutes;
  /** Before `context.today`: its available minutes are not counted toward the week's. */
  isPast: boolean;
}

/** The three lines of the capacity display, and the per-day bars beneath them. */
export interface WeekCapacity {
  /** PLANNED — the sum of every day's `plannedMinutes`. */
  plannedMinutes: Minutes;
  /** AVAILABLE — open working time on today and the days after it. */
  availableMinutes: Minutes;
  /** UNSCHEDULED WORK — estimate not yet covered by any work block, over the tasks given. */
  unscheduledMinutes: Minutes;
  /** Configured working time across the whole range, past days included. */
  workingMinutes: Minutes;
  days: readonly DayWorkload[];
}

/** The block a warning points at. */
export interface WarningBlock {
  id: string;
  title: string;
}

/** All warnings are information: nothing blocks an action, and `describeWarning` never judges the person (Domain Rule 7). */
export type PlanningWarning =
  | {
      kind: "overlap";
      /** The local date the overlap begins on. */
      date: LocalDate;
      first: WarningBlock;
      second: WarningBlock;
      overlapMinutes: Minutes;
    }
  | {
      kind: "past-deadline";
      block: WarningBlock;
      taskId: Uuid;
      dueDate: LocalDate;
      /** The local date the block sits on. */
      date: LocalDate;
    }
  | {
      kind: "over-capacity";
      /** The day, or null when the whole range exceeds its working time. */
      date: LocalDate | null;
      plannedMinutes: Minutes;
      workingMinutes: Minutes;
    }
  | {
      kind: "insufficient-time";
      taskId: Uuid;
      title: string;
      dueDate: LocalDate;
      /** Estimate not yet covered by any work block. */
      remainingMinutes: Minutes;
      /** Open working time between now and the end of the due date. */
      availableMinutes: Minutes;
    };

export type PlanningWarningKind = PlanningWarning["kind"];

export interface FindTimeInput {
  /** What is being placed. Only the title and deadline are read; the length is `durationMinutes`. */
  task: Pick<PlanningTask, "id" | "title" | "dueDate">;
  /** The block length to place: the estimate, or the caller's fallback for an unestimated task. */
  durationMinutes: Minutes;
  commitments: readonly Commitment[];
  context: PlanningContext;
  /** Nothing before this instant is suggested. Injected, never read from a clock. */
  now: Instant;
  /** Candidate starts land on this increment, from the profile. */
  snapMinutes: Minutes;
  /** How many candidates to return. Default 5. */
  limit?: number;
}

/** The ranking criteria, in order. Candidates are ordered lexicographically by these fields, then by start instant; nothing is weighted. */
export interface CandidateScore {
  /** 1. The slot ends on or before the end of the due date. True for an undated task. */
  beforeDeadline: boolean;
  /** 2. The slot lies entirely inside a configured working window. */
  withinWorkingHours: boolean;
  /** 3. Commitments the slot overlaps. Zero unless the range has no open slot at all. */
  conflicts: number;
  /** 4. Leftover pieces shorter than `MIN_USEFUL_GAP_MINUTES` that placing here would leave (0..2). */
  fragments: number;
  /** 5. 2 when the slot is fully inside a focus window, 1 when partly, 0 otherwise. */
  focusFit: 0 | 1 | 2;
}

export interface FindTimeCandidate {
  /** Wall clock on `span.date`: what one-click Schedule sends to the server. */
  span: SlotSpan;
  startAt: Instant;
  endAt: Instant;
  score: CandidateScore;
  /** Elapsed length of the open window the slot was cut from. */
  openWindowMinutes: Minutes;
  /** Titles of the commitments the slot overlaps; empty unless `score.conflicts > 0`. */
  overlaps: readonly string[];
  /** "Wednesday 4:00–5:00 PM — 2-hour open window before Thursday deadline." */
  explanation: string;
}

/**
 *   found                every candidate is an open slot
 *   fallback-overlaps    no open slot fits anywhere in the range, so the
 *                        candidates overlap existing blocks and say which
 *   longer-than-any-gap  the task is longer than every open window and longer
 *                        than any day's whole span, so even overlapping
 *                        placements were not offered
 *   range-past           every day in the range is already over
 *   nothing              the range has no time at all to offer (empty days)
 */
export type FindTimeOutcome =
  "found" | "fallback-overlaps" | "longer-than-any-gap" | "range-past" | "nothing";

export interface FindTimeResult {
  outcome: FindTimeOutcome;
  /** Best first. At most `limit` entries. */
  candidates: readonly FindTimeCandidate[];
  /** One neutral sentence about the outcome when the list needs explaining; null when it does not. */
  note: string | null;
}
