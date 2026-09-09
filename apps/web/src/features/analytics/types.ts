import type { AnalyticsRange, AnalyticsSummary } from "@momentum/core/analytics";
import type { IanaTimeZone, LocalDate, ProjectColor, Uuid, Weekday } from "@momentum/core/types";

// Everything is resolved on the server; the client island receives domain
// values and never a database row.

/** A project as a chart labels it, plus the unassigned bucket. */
export interface AnalyticsProject {
  /** Null is the "No project" bucket: a real series, not a missing value. */
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
  /** All three windows, aggregated from one read; the control switches with no fetch. */
  ranges: Record<AnalyticsRange, AnalyticsSummary>;
  /**
   * The widest window holds nothing at all. Distinct from a single range being
   * empty: work in April but not this week shows the 7-day charts at zero, not
   * the new-account empty state.
   */
  hasNoHistory: boolean;
}
