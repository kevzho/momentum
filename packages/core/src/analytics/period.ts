import { addDays, startOfDay } from "../time";
import type { IanaTimeZone, Instant, LocalDate } from "../types/scalars";

/**
 * A period is a set of local dates first and a pair of instants second: the
 * instant window is derived from the dates through `startOfDay`, so DST days
 * keep their real length. Subtracting `n * 24h` from a timestamp would not.
 */

export const ANALYTICS_RANGES = ["7", "30", "90"] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

/** How many local dates each range covers, today included. */
export const RANGE_DAYS: Record<AnalyticsRange, number> = { "7": 7, "30": 30, "90": 90 };

/** The widest range; the only one read from the database. */
export const WIDEST_RANGE: AnalyticsRange = "90";

export interface AnalyticsPeriod {
  range: AnalyticsRange;
  /** Inclusive first local date. */
  from: LocalDate;
  /** Inclusive last local date: today, in the user's timezone. */
  to: LocalDate;
  /** Every date from `from` to `to`, oldest first. The x-axis of every day-bucketed series. */
  days: readonly LocalDate[];
  /** The half-open UTC window `[start, end)` a query reads. */
  window: { start: Instant; end: Instant };
}

export function analyticsPeriod(
  range: AnalyticsRange,
  today: LocalDate,
  timezone: IanaTimeZone,
): AnalyticsPeriod {
  const from = addDays(today, -(RANGE_DAYS[range] - 1));
  const days: LocalDate[] = [];
  for (let i = 0; i < RANGE_DAYS[range]; i += 1) days.push(addDays(from, i));

  return {
    range,
    from,
    to: today,
    days,
    window: {
      start: startOfDay(from, timezone),
      // The exclusive end is tomorrow's local midnight, so today is whole.
      end: startOfDay(addDays(today, 1), timezone),
    },
  };
}

/** The three periods that share one ninety-day read; each narrower one is the tail of the widest. */
export function allPeriods(
  today: LocalDate,
  timezone: IanaTimeZone,
): Record<AnalyticsRange, AnalyticsPeriod> {
  return {
    "7": analyticsPeriod("7", today, timezone),
    "30": analyticsPeriod("30", today, timezone),
    "90": analyticsPeriod("90", today, timezone),
  };
}

/** Whether a local date falls inside the period. Both ends inclusive, like `days`. */
export function periodContains(period: AnalyticsPeriod, date: LocalDate): boolean {
  return date >= period.from && date <= period.to;
}
