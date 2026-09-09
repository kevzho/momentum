import type { Instant, Minutes, Uuid } from "./scalars";

export const FOCUS_SESSION_STATUSES = ["running", "paused", "completed", "abandoned"] as const;
export type FocusSessionStatus = (typeof FOCUS_SESSION_STATUSES)[number];

/**
 * Timer truth is `startedAt` plus the pause records, all stamped server-side.
 * Elapsed and remaining time are derived from these on every tick; a client
 * counter is never the source of truth (specs/07-focus-mode.md).
 */
export interface FocusSession {
  id: Uuid;
  userId: Uuid;
  taskId: Uuid | null;
  projectId: Uuid | null;
  plannedMinutes: Minutes;
  /** Set on completion by trusted database logic; excludes paused time. */
  actualMinutes: Minutes | null;
  startedAt: Instant;
  endedAt: Instant | null;
  status: FocusSessionStatus;
  /** Only incremented when the user explicitly marks an interruption. */
  interruptionCount: number;
  createdAt: Instant;
}

export interface FocusPause {
  id: Uuid;
  sessionId: Uuid;
  pausedAt: Instant;
  /** Null while the session is paused. */
  resumedAt: Instant | null;
}
