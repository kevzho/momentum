import { fromLocal, ianaTimeZone, instant, localDate } from "../time";
import type { IanaTimeZone, Instant, LocalDate, Minutes, Uuid } from "../types/scalars";
import type {
  CompletedTaskFact,
  FocusSessionFact,
  HabitCompletionFact,
  HabitFact,
  WorkBlockFact,
} from "./facts";

/**
 * Builders for the analytics suite.
 *
 * Every fixture is expressed as a **wall-clock reading in a named zone** and
 * converted with `fromLocal`, never as a hand-written `Z` timestamp. A test
 * that says "a session at 09:00 on 8 March in New York" then keeps meaning that
 * on the morning the clocks move, which is the only way these tests can be
 * evidence about DST rather than an elaborate restatement of UTC arithmetic.
 */

/**
 * The transition instants in 2026, quoted from `time/zone.test.ts` so the two
 * suites cannot disagree about when the clocks moved:
 *
 *   America/New_York  2026-03-08 07:00Z  local 02:00 -> 03:00  (day is 23h)
 *                     2026-11-01 06:00Z  local 02:00 -> 01:00  (day is 25h)
 *   Asia/Kolkata      no transitions, fixed +05:30
 */
export const NEW_YORK = ianaTimeZone("America/New_York");
export const KOLKATA = ianaTimeZone("Asia/Kolkata");

/** The local date the New York clocks spring forward on. */
export const SPRING_FORWARD: LocalDate = localDate("2026-03-08");
/** The local date they fall back on. */
export const FALL_BACK: LocalDate = localDate("2026-11-01");

export const d = localDate;
export const i = instant;

/** A wall-clock reading in a zone, as the instant it names. */
export function at(date: string, hour: number, minute = 0, tz: IanaTimeZone = NEW_YORK): Instant {
  return fromLocal(localDate(date), hour * 60 + minute, tz);
}

export function session(options: {
  date: string;
  hour: number;
  minute?: number;
  minutes: Minutes | null;
  projectId?: Uuid | null;
  tz?: IanaTimeZone;
}): FocusSessionFact {
  return {
    startedAt: at(options.date, options.hour, options.minute ?? 0, options.tz ?? NEW_YORK),
    actualMinutes: options.minutes,
    projectId: options.projectId ?? null,
  };
}

export function task(options: {
  id?: Uuid;
  date: string;
  hour: number;
  minute?: number;
  estimated?: Minutes | null;
  actual?: Minutes;
  projectId?: Uuid | null;
  tz?: IanaTimeZone;
}): CompletedTaskFact {
  return {
    id: options.id ?? `task-${options.date}-${options.hour}`,
    projectId: options.projectId ?? null,
    completedAt: at(options.date, options.hour, options.minute ?? 0, options.tz ?? NEW_YORK),
    estimatedMinutes: options.estimated === undefined ? null : options.estimated,
    actualMinutes: options.actual ?? 0,
  };
}

export function block(options: {
  date: string;
  hour: number;
  minutes?: Minutes;
  done?: boolean;
  tz?: IanaTimeZone;
}): WorkBlockFact {
  const tz = options.tz ?? NEW_YORK;
  const startAt = at(options.date, options.hour, 0, tz);
  const endAt = fromLocal(localDate(options.date), options.hour * 60 + (options.minutes ?? 60), tz);
  return {
    startAt,
    endAt,
    completedAt: options.done === true ? endAt : null,
  };
}

/** A `daily` habit, tracked from `trackedFrom`. */
export function dailyHabit(id: Uuid, trackedFrom: string, archivedFrom?: string): HabitFact {
  return {
    id,
    habit: {
      frequencyType: "daily",
      target: 1,
      unit: "count",
      activeDays: [],
      estimatedMinutes: null,
      preferredStartTime: null,
    },
    trackedFrom: localDate(trackedFrom),
    archivedFrom: archivedFrom === undefined ? null : localDate(archivedFrom),
  };
}

/** A `times_per_week` habit: it names no specific day, so it expects nothing of one. */
export function weeklyHabit(id: Uuid, trackedFrom: string, target = 3): HabitFact {
  return {
    id,
    habit: {
      frequencyType: "times_per_week",
      target,
      unit: "count",
      activeDays: [],
      estimatedMinutes: null,
      preferredStartTime: null,
    },
    trackedFrom: localDate(trackedFrom),
    archivedFrom: null,
  };
}

export function completion(habitId: Uuid, date: string, amount = 1): HabitCompletionFact {
  return { habitId, completionDate: localDate(date), amount };
}
