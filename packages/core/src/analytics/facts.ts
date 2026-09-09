import type { HabitCompletionLike, HabitSchedule } from "../habits";
import type { Instant, LocalDate, Minutes, Uuid } from "../types/scalars";

/**
 * What the aggregations read, and nothing more.
 *
 * Each shape is the subset of a domain entity the maths actually touches, in
 * the style `HabitCompletionLike` already established: a real `FocusSession`
 * satisfies `FocusSessionFact` structurally, and so does a fixture, and so does
 * an optimistic row that has not been persisted. Nothing here imports a
 * database row, so Phase 14 can feed the same functions from a different read
 * without either phase learning about the other's query.
 */

/** A focus session, as `focusMinutes*` reads it. */
export interface FocusSessionFact {
  /** A session belongs to the local date it *started* on (`@momentum/core/focus`). */
  startedAt: Instant;
  /**
   * Measured minutes, excluding paused time. Null while a session is still
   * running: it has recorded nothing yet, and counting it as zero would put a
   * zero-height bar on today for a user who is mid-session.
   */
  actualMinutes: Minutes | null;
  /** Null is "no project" — a real bucket, not a missing value. */
  projectId: Uuid | null;
}

/**
 * A completed task, as the trend, the hour distribution and the estimate
 * comparison read it.
 *
 * `estimatedMinutes` and `actualMinutes` are carried as the two separate
 * columns they are (Domain Rule 3). Nothing in this module ever reads one when
 * the other is missing.
 */
export interface CompletedTaskFact {
  id: Uuid;
  projectId: Uuid | null;
  /** Null only in shapes that have not been narrowed; such a row is skipped. */
  completedAt: Instant | null;
  /** User intent, set at capture or planning time. Null when never estimated. */
  estimatedMinutes: Minutes | null;
  /** Measured, derived from focus sessions by trusted database logic. */
  actualMinutes: Minutes;
}

/** A work block, as the scheduled-versus-completed counts read it. */
export interface WorkBlockFact {
  startAt: Instant;
  endAt: Instant;
  /** Set when the span was executed. Completing a block is not completing a task (Domain Rule 13). */
  completedAt: Instant | null;
}

/** A habit and the dates it was answerable for, as the consistency series reads it. */
export interface HabitFact {
  id: Uuid;
  habit: HabitSchedule;
  /** The habit's first tracked local date. Nothing before it is expected of it. */
  trackedFrom: LocalDate;
  /**
   * The local date the habit was archived on, if it was. From that date on it
   * asks nothing, so an archived habit stops lowering a rate the moment the
   * user retired it rather than for the rest of the period.
   */
  archivedFrom: LocalDate | null;
}

/** A habit completion, tagged with the habit it belongs to. */
export interface HabitCompletionFact extends HabitCompletionLike {
  habitId: Uuid;
}

/** A project, reduced to what a chart label and an insight sentence need. */
export interface ProjectFact {
  id: Uuid;
  name: string;
}
