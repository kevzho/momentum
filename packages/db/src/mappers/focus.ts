import {
  FOCUS_SESSION_STATUSES,
  type FocusPause,
  type FocusSession,
  type FocusSessionStatus,
} from "@momentum/core/types";

import type { Row } from "../types";
import { oneOf, toInstant, toInstantOrNull } from "./scalars";

export function rowToFocusSession(row: Row<"focus_sessions">): FocusSession {
  return {
    id: row.id,
    userId: row.user_id,
    taskId: row.task_id,
    projectId: row.project_id,
    plannedMinutes: row.planned_minutes,
    actualMinutes: row.actual_minutes,
    startedAt: toInstant(row.started_at),
    endedAt: toInstantOrNull(row.ended_at),
    status: oneOf<FocusSessionStatus>(FOCUS_SESSION_STATUSES, row.status, "focus_sessions.status"),
    interruptionCount: row.interruption_count,
    createdAt: toInstant(row.created_at),
  };
}

export function rowToFocusPause(row: Row<"focus_pauses">): FocusPause {
  return {
    id: row.id,
    sessionId: row.session_id,
    pausedAt: toInstant(row.paused_at),
    resumedAt: toInstantOrNull(row.resumed_at),
  };
}
