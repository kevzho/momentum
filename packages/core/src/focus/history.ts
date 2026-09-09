import type { IanaTimeZone, LocalDate, Minutes, Uuid } from "../types/scalars";
import type { FocusSession } from "../types/focus";
import { localDateOf } from "../time/zone";

/**
 * What the focus history counts, and what it counts it over.
 *
 * Pure, like the rest of `@momentum/core`: it takes the sessions, the
 * timezone, today's date and the week's dates, and reads no clock. "Today" and
 * "this week" are the user's, resolved from the profile timezone by the caller
 * and applied here through `localDateOf` (Domain Rule 4).
 *
 * **A session belongs to the local date it started on.** A session begun at
 * 23:40 and finished at 00:10 is counted on the day the user sat down, which is
 * the same convention the calendar uses to decide a block's column, and the
 * only one that keeps "3 sessions today" agreeing with the list underneath it.
 *
 * The two numbers are deliberately different questions:
 *
 * - **`focusedMinutes`** is every measured minute a finished session recorded,
 *   an abandoned one included. The time was spent; a session the user ended
 *   early is still work done, and hiding it would make the product's own
 *   actual-versus-estimate signal (Domain Rule 3) quietly incomplete.
 * - **`completedSessions`** counts only the sessions that ran to a finish.
 *
 * Neither of them is a judgement, and there is no third number for the
 * sessions that were abandoned (Domain Rule 7).
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
    // A session still running has recorded nothing yet: its minutes are not a
    // fact until `finish_focus_session` writes them.
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
