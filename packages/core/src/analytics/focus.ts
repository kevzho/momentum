import { localDateOf, weekdayOf } from "../time";
import type { IanaTimeZone, Minutes, Uuid, Weekday } from "../types/scalars";
import {
  dayBucket,
  daySeries,
  hourBucket,
  hourSeries,
  weekdaySeries,
  type DayValue,
  type HourValue,
  type WeekdayValue,
} from "./buckets";
import type { FocusSessionFact } from "./facts";
import { periodContains, type AnalyticsPeriod } from "./period";

/**
 * Focused time, bucketed three ways.
 *
 * "Focused" means measured minutes a session recorded, an abandoned session
 * included — the same definition `@momentum/core/focus` uses for the history
 * strip, and for the same reason: time spent is time spent, and dropping the
 * sessions a user ended early would quietly under-report the actual half of the
 * product's estimate signal (Domain Rule 3).
 *
 * A running session contributes nothing. Its minutes are not a fact until
 * `finish_focus_session` writes them.
 */

/** Minutes and the number of sessions behind them, for one project. */
export interface ProjectMinutes {
  /** Null is "no project": a real bucket the user can see, not a gap. */
  projectId: Uuid | null;
  minutes: Minutes;
  sessions: number;
}

/** Only sessions that recorded minutes, and only inside the period. */
function measuredIn(
  sessions: readonly FocusSessionFact[],
  period: AnalyticsPeriod,
  timezone: IanaTimeZone,
): FocusSessionFact[] {
  return sessions.filter(
    (session) =>
      session.actualMinutes !== null &&
      periodContains(period, localDateOf(session.startedAt, timezone)),
  );
}

/** Chart 1: focus time by day, zero-filled across the whole period. */
export function focusMinutesByDay(
  sessions: readonly FocusSessionFact[],
  period: AnalyticsPeriod,
  timezone: IanaTimeZone,
): DayValue[] {
  return daySeries(
    period.days,
    measuredIn(sessions, period, timezone),
    (session) => dayBucket(session.startedAt, timezone),
    (session) => session.actualMinutes ?? 0,
  );
}

/**
 * Chart 2: focus time by project, largest first.
 *
 * Ties break on the id so the order is stable between two renders of the same
 * data — a chart whose bars swap places on a refresh reads as a bug.
 */
export function focusMinutesByProject(
  sessions: readonly FocusSessionFact[],
  period: AnalyticsPeriod,
  timezone: IanaTimeZone,
): ProjectMinutes[] {
  const totals = new Map<string, ProjectMinutes>();

  for (const session of measuredIn(sessions, period, timezone)) {
    const key = session.projectId ?? "";
    const bucket = totals.get(key);
    if (bucket) {
      bucket.minutes += session.actualMinutes ?? 0;
      bucket.sessions += 1;
    } else {
      totals.set(key, {
        projectId: session.projectId,
        minutes: session.actualMinutes ?? 0,
        sessions: 1,
      });
    }
  }

  return [...totals.values()].sort(
    (a, b) => b.minutes - a.minutes || (a.projectId ?? "").localeCompare(b.projectId ?? ""),
  );
}

/** Focus minutes per hour of the local clock — the time-of-day figure's second measure. */
export function focusMinutesByHour(
  sessions: readonly FocusSessionFact[],
  period: AnalyticsPeriod,
  timezone: IanaTimeZone,
): HourValue[] {
  return hourSeries(
    measuredIn(sessions, period, timezone),
    (session) => hourBucket(session.startedAt, timezone),
    (session) => session.actualMinutes ?? 0,
  );
}

/**
 * Focus minutes per weekday, with the session count behind each.
 *
 * Feeds the weekday insight, which may only speak when enough sessions sit
 * behind the answer (Domain Rule 8).
 */
export function focusMinutesByWeekday(
  sessions: readonly FocusSessionFact[],
  period: AnalyticsPeriod,
  timezone: IanaTimeZone,
): WeekdayValue[] {
  return weekdaySeries(
    measuredIn(sessions, period, timezone),
    (session): Weekday => weekdayOf(localDateOf(session.startedAt, timezone)),
    (session) => session.actualMinutes ?? 0,
  );
}

/** Every measured minute in the period. */
export function totalFocusMinutes(
  sessions: readonly FocusSessionFact[],
  period: AnalyticsPeriod,
  timezone: IanaTimeZone,
): Minutes {
  return measuredIn(sessions, period, timezone).reduce(
    (total, session) => total + (session.actualMinutes ?? 0),
    0,
  );
}
