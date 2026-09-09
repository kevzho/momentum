import type { AnalyticsRange, AnalyticsSummary } from "@momentum/core/analytics";
import type { IanaTimeZone, LocalDate, ProjectColor, Uuid, Weekday } from "@momentum/core/types";

/**
 * What `/analytics` renders. Everything is resolved on the server; the client
 * island receives domain values and never a database row
 * (docs/ARCHITECTURE.md §5, §6).
 */

/** A project as a chart labels it, plus the unassigned bucket. */
export interface AnalyticsProject {
  /** Null is the "No project" bucket — a real series, not a missing value. */
  id: Uuid | null;
  name: string;
  color: ProjectColor;
}

export interface AnalyticsPageData {
  timezone: IanaTimeZone;
  today: LocalDate;
  weekStart: Weekday;
  /** Labels for every project the charts can name. */
  projects: AnalyticsProject[];
  /**
   * All three windows, aggregated from one read.
   *
   * The control switches between them in the client with no round trip, which
   * is what "switch without a full reload" means here — there is not even a
   * fetch. The cost is one payload instead of three renders, and ninety days of
   * one person's productivity data is small.
   */
  ranges: Record<AnalyticsRange, AnalyticsSummary>;
  /**
   * The widest window holds nothing at all.
   *
   * Distinct from a single range being empty: a user with work in April but not
   * this week should see the 7-day charts sit at zero with the range control
   * still offering them 90 days, not the new-account empty state.
   */
  hasNoHistory: boolean;
}
