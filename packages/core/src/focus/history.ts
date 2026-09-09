import type { IanaTimeZone, LocalDate, Minutes, Uuid } from "../types/scalars";
import type { FocusSession } from "../types/focus";
import { localDateOf } from "../time/zone";

/**
 * A session belongs to the local date it started on, matching the calendar's
 * column rule. `focusedMinutes` includes abandoned sessions (the time was
 * spent); `completedSessions` counts only those that ran to a finish.
 */

export interface FocusTotals {
  focusedMinutes: Minutes;
  completedSessions: number;
}

export interface FocusProjectTotal {
  /** Null is "no project" — a real bucket, not a missing value. */
  projectId: Uuid | null;
  focusedMinutes: Minutes;
  completedSessions: number;
}

export interface FocusHistoryInput {
  sessions: readonly FocusSession[];
  timezone: IanaTimeZone;
  today: LocalDate;
  /** The seven dates of the displayed week, in order. */
  week: readonly LocalDate[];
}

export interface FocusHistory {
  today: FocusTotals;
  week: FocusTotals;
  /** The week's minutes by project, largest first; ties broken by id for stability. */
  byProject: FocusProjectTotal[];
}

export function summariseFocus(input: FocusHistoryInput): FocusHistory {
  const weekDates = new Set<string>(input.week);

  const today = empty();
  const week = empty();
  const projects = new Map<string, FocusProjectTotal>();

  for (const session of input.sessions) {
    // A running session has recorded nothing until `finish_focus_session` writes its minutes.
    if (session.actualMinutes === null) continue;

    const date = localDateOf(session.startedAt, input.timezone);
    const completed = session.status === "completed";

    if (date === input.today) add(today, session.actualMinutes, completed);
    if (!weekDates.has(date)) continue;

    add(week, session.actualMinutes, completed);

    const key = session.projectId ?? "";
    const bucket = projects.get(key);
    if (bucket) {
      bucket.focusedMinutes += session.actualMinutes;
      if (completed) bucket.completedSessions += 1;
    } else {
      projects.set(key, {
        projectId: session.projectId,
        focusedMinutes: session.actualMinutes,
        completedSessions: completed ? 1 : 0,
      });
    }
  }

  const byProject = [...projects.values()].sort(
    (a, b) =>
      b.focusedMinutes - a.focusedMinutes || (a.projectId ?? "").localeCompare(b.projectId ?? ""),
  );

  return { today, week, byProject };
}

function empty(): FocusTotals {
  return { focusedMinutes: 0, completedSessions: 0 };
}

function add(totals: FocusTotals, minutes: Minutes, completed: boolean): void {
  totals.focusedMinutes += minutes;
  if (completed) totals.completedSessions += 1;
}
