import type { HabitCompletionLike, HabitSchedule } from "../habits";
import type { Instant, LocalDate, Minutes, Uuid } from "../types/scalars";

/** The subsets of the domain entities the aggregations read; real rows satisfy them structurally. */

export interface FocusSessionFact {
  /** A session belongs to the local date it started on. */
  startedAt: Instant;
  /** Measured minutes, excluding paused time. Null while still running; never counted as zero. */
  actualMinutes: Minutes | null;
  /** Null is "no project" — a real bucket, not a missing value. */
  projectId: Uuid | null;
}

/** `estimatedMinutes` and `actualMinutes` stay separate (Domain Rule 3); neither substitutes for the other. */
export interface CompletedTaskFact {
  id: Uuid;
  projectId: Uuid | null;
  /** Null only in shapes that have not been narrowed; such a row is skipped. */
  completedAt: Instant | null;
  /** Null when never estimated. */
  estimatedMinutes: Minutes | null;
  actualMinutes: Minutes;
}

export interface WorkBlockFact {
  startAt: Instant;
  endAt: Instant;
  /** Completing a block is not completing a task (Domain Rule 13). */
  completedAt: Instant | null;
}

export interface HabitFact {
  id: Uuid;
  habit: HabitSchedule;
  /** The habit's first tracked local date. Nothing before it is expected of it. */
  trackedFrom: LocalDate;
  /** The local date the habit was archived on, if it was; from that date on it asks nothing. */
  archivedFrom: LocalDate | null;
}

export interface HabitCompletionFact extends HabitCompletionLike {
  habitId: Uuid;
}

export interface ProjectFact {
  id: Uuid;
  name: string;
}
