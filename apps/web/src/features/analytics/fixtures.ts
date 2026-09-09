import {
  allPeriods,
  summariseAnalytics,
  type AnalyticsInput,
  type AnalyticsRange,
  type AnalyticsSummary,
} from "@momentum/core/analytics";
import { fromLocal, ianaTimeZone, localDate } from "@momentum/core/time";
import type { IanaTimeZone, Instant } from "@momentum/core/types";

import type { AnalyticsPageData, AnalyticsProject } from "@/features/analytics/types";

/**
 * Fixtures for the analytics component suite.
 *
 * They run the *real* aggregation — `summariseAnalytics`, over the same three
 * periods the page reads — rather than hand-writing a summary object. A
 * hand-written one would let a component test keep passing after the maths it
 * renders had changed shape, which is the only failure these tests exist to
 * catch.
 */

export const TZ: IanaTimeZone = ianaTimeZone("America/New_York");
export const TODAY = localDate("2026-06-17");

/** A wall-clock reading in the fixture zone, as the instant it names. */
export function at(date: string, hour: number, minute = 0): Instant {
  return fromLocal(localDate(date), hour * 60 + minute, TZ);
}

export const PROJECTS: AnalyticsProject[] = [
  { id: "p1", name: "Thesis", color: "violet" },
  { id: "p2", name: "Admin", color: "teal" },
  { id: null, name: "No project", color: "slate" },
];

type Rows = Omit<AnalyticsInput, "period" | "timezone">;

const NOTHING: Rows = {
  focusSessions: [],
  completedTasks: [],
  workBlocks: [],
  habits: [],
  habitCompletions: [],
  projects: [],
};

/** Runs the real aggregation over all three windows and wraps it as page data. */
export function analyticsData(rows: Partial<Rows> = {}): AnalyticsPageData {
  const merged: Rows = { ...NOTHING, ...rows };
  const periods = allPeriods(TODAY, TZ);

  const summarise = (range: AnalyticsRange): AnalyticsSummary =>
    summariseAnalytics({ ...merged, period: periods[range], timezone: TZ });

  const ranges: Record<AnalyticsRange, AnalyticsSummary> = {
    "7": summarise("7"),
    "30": summarise("30"),
    "90": summarise("90"),
  };

  return {
    timezone: TZ,
    today: TODAY,
    weekStart: 1,
    projects: PROJECTS,
    ranges,
    hasNoHistory: ranges["90"].isEmpty,
  };
}

/** A modest but real history: sessions, completions and blocks across the window. */
export function busyRows(): Rows {
  return {
    focusSessions: [
      { startedAt: at("2026-06-16", 9), actualMinutes: 50, projectId: "p1" },
      { startedAt: at("2026-06-16", 14), actualMinutes: 25, projectId: "p2" },
      { startedAt: at("2026-06-15", 10), actualMinutes: 90, projectId: "p1" },
      // Inside 30 days but outside 7 — the range control has to move this one.
      { startedAt: at("2026-06-02", 9), actualMinutes: 45, projectId: "p1" },
      // Inside 90 days but outside 30.
      { startedAt: at("2026-04-20", 9), actualMinutes: 120, projectId: "p2" },
    ],
    completedTasks: [
      {
        id: "t1",
        projectId: "p1",
        completedAt: at("2026-06-16", 11),
        estimatedMinutes: 60,
        actualMinutes: 95,
      },
      {
        id: "t2",
        projectId: "p1",
        completedAt: at("2026-06-15", 17),
        estimatedMinutes: 30,
        actualMinutes: 40,
      },
      // No estimate: it must not reach either side of the comparison.
      {
        id: "t3",
        projectId: "p2",
        completedAt: at("2026-06-16", 20),
        estimatedMinutes: null,
        actualMinutes: 240,
      },
    ],
    workBlocks: [
      {
        startAt: at("2026-06-15", 9),
        endAt: at("2026-06-15", 10),
        completedAt: at("2026-06-15", 10),
      },
      { startAt: at("2026-06-16", 9), endAt: at("2026-06-16", 11), completedAt: null },
    ],
    habits: [
      {
        id: "h1",
        habit: {
          frequencyType: "daily",
          target: 1,
          unit: "count",
          activeDays: [],
          estimatedMinutes: null,
          preferredStartTime: null,
        },
        trackedFrom: localDate("2026-06-01"),
        archivedFrom: null,
      },
    ],
    habitCompletions: [
      { habitId: "h1", completionDate: localDate("2026-06-15"), amount: 1 },
      { habitId: "h1", completionDate: localDate("2026-06-16"), amount: 1 },
    ],
    projects: [
      { id: "p1", name: "Thesis" },
      { id: "p2", name: "Admin" },
    ],
  };
}

/**
 * Enough scheduled work for the block-completion pattern to clear its threshold
 * — fifteen blocks, twelve of them marked done.
 */
export function manyBlocks(): Rows {
  const blocks = Array.from({ length: 15 }, (_, index) => {
    const date = `2026-06-${String(index + 1).padStart(2, "0")}`;
    return {
      startAt: at(date, 9),
      endAt: at(date, 10),
      completedAt: index < 12 ? at(date, 10) : null,
    };
  });
  return { ...NOTHING, workBlocks: blocks };
}
