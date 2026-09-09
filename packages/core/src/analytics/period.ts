import { addDays, startOfDay } from "../time";
import type { IanaTimeZone, Instant, LocalDate } from "../types/scalars";

/**
 * The window every aggregation in this module is measured over.
 *
 * A period is a set of **local dates** first and a pair of instants second, and
 * that order matters. "The last 30 days" is a question about the user's
 * calendar, so it is answered by counting dates; the instant window is derived
 * from those dates at the end, through `startOfDay`, which knows that the local
 * days either side of a DST transition are 23 or 25 hours long (Domain Rule 4).
 * Subtracting `30 * 24 * 60 * 60 * 1000` from a timestamp would be off by an
 * hour twice a year, and off by a whole day for a user far enough east.
 *
 * Both ends are the user's: `to` is today in the profile timezone, never the
 * server's date, and `from` is inclusive, so a 7-day period is today plus the
 * six days before it.
 */

/** The three windows specs/10-analytics.md names, as the values a control switches between. */
export const ANALYTICS_RANGES = ["7", "30", "90"] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

/** How many local dates each range covers, today included. */
export const RANGE_DAYS: Record<AnalyticsRange, number> = { "7": 7, "30": 30, "90": 90 };

/** The widest range, and therefore the only one that has to be read from the database. */
export const WIDEST_RANGE: AnalyticsRange = "90";

export interface AnalyticsPeriod {
  range: AnalyticsRange;
  /** Inclusive first local date. */
  from: LocalDate;
  /** Inclusive last local date: today, in the user's timezone. */
  to: LocalDate;
  /** Every date from `from` to `to`, oldest first. The x-axis of every day-bucketed series. */
  days: readonly LocalDate[];
  /**
   * The half-open UTC window `[start, end)` a query reads. Half-open like every
   * other window in the codebase, so a row stamped exactly at local midnight
   * belongs to the later day and is never counted twice.
   */
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

/**
 * The three periods that share one read.
 *
 * The page reads ninety days once and aggregates it three times, so switching
 * range costs nothing and touches no network (docs/ARCHITECTURE.md §5).
 *
 * Each is built by `analyticsPeriod` from the same `today` rather than sliced
 * out of the widest one. The two agree — `addDays` is pure calendar arithmetic
 * and a tail slice would give the same dates — and `period.test.ts` pins that
 * they do. Building them the same way is what makes the agreement a property
 * worth testing instead of an assumption three call sites quietly share.
 */
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
