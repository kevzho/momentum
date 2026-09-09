import { formatDuration, formatLocalDate } from "@momentum/core/time";
import type { AnalyticsRange } from "@momentum/core/analytics";
import type { LocalDate } from "@momentum/core/types";

/**
 * Every word `/analytics` says.
 *
 * One module, for the reason `features/today/copy.ts` is one module: Domain
 * Rules 7 and 8 are constraints on *language*, and a constraint on language can
 * only be enforced where the language lives. `copy.test.ts` reads this file and
 * the comment-stripped source of every other file in the feature, and fails on
 * the vocabulary the rules forbid.
 *
 * The vocabulary this surface uses. Time was **recorded** or **tracked**, never
 * earned or lost. Work was **marked done**, never achieved. A period **holds**
 * numbers; it is not a good or a bad one. Estimates and actuals are two
 * measurements shown side by side — the page never says one of them was wrong.
 *
 * And nothing here explains *why* a number is what it is. The page reports
 * what was measured and stops, because observational data of this kind cannot
 * support a claim about cause (Domain Rule 8).
 */

export const ANALYTICS_COPY = {
  title: "Analytics",
  description: "What the last weeks held, next to what was planned for them.",

  rangeLabel: "Time window",
  ranges: {
    "7": { label: "7 days", ariaLabel: "Last 7 days" },
    "30": { label: "30 days", ariaLabel: "Last 30 days" },
    "90": { label: "90 days", ariaLabel: "Last 90 days" },
  } satisfies Record<AnalyticsRange, { label: string; ariaLabel: string }>,

  totals: {
    focused: "Focused time",
    tasks: "Tasks completed",
    habits: "Habit consistency",
    blocks: "Blocks marked done",
  },

  insights: {
    title: "Patterns",
    /**
     * The panel's own caveat, shown once above the sentences. It states the
     * limit of the data rather than hedging each finding, so no single line has
     * to carry a disclaimer that would make it read as a verdict softened.
     */
    caveat:
      "These describe what was recorded over the window. They report measurements side by side, not reasons.",
    empty: "No patterns yet — these appear once a window holds enough recorded work to describe.",
  },

  charts: {
    focusByDay: {
      title: "Focus time by day",
      description: "Minutes recorded in focus sessions, by the day each session began.",
      empty: "No focus sessions were recorded in this window.",
    },
    focusByProject: {
      title: "Focus time by project",
      description: "Where the recorded minutes went.",
      empty: "No focus sessions were recorded in this window.",
    },
    plannedVsActual: {
      title: "Planned vs. actual",
      description:
        "Estimated time next to recorded time, over the completed tasks that carry both.",
      empty: "No completed task in this window carries both an estimate and recorded time.",
      planned: "Planned",
      actual: "Actual",
      /** Named so the reader knows what the comparison leaves out. */
      uncovered: (count: number): string =>
        count === 1
          ? "1 completed task is not shown here: it carries an estimate or recorded time, but not both."
          : `${count} completed tasks are not shown here: they carry an estimate or recorded time, but not both.`,
    },
    habits: {
      title: "Consistency by day",
      description: "Each day of the window, and how much of what it asked for was recorded.",
      empty: "No habits were being tracked in this window.",
    },
    completions: {
      title: "Completion trend",
      description: "Completions per day, by the day each task was finished.",
      empty: "No tasks were completed in this window.",
    },
    timeOfDay: {
      title: "Time of day",
      description: "The hours of your day completions fall in, in your timezone.",
      empty: "No tasks were completed in this window.",
    },
  },

  empty: {
    title: "Nothing recorded yet",
    description:
      "Analytics fills in as you schedule work, run focus sessions and complete tasks. Come back once a few days have been tracked.",
    action: "Go to today",
  },

  /** The heading of every chart's hidden data table. */
  tableCaption: (title: string): string => `${title} — the same data as a table`,
  columns: {
    date: "Date",
    hour: "Hour",
    project: "Project",
    minutes: "Minutes",
    focusedTime: "Focused time",
    tasks: "Tasks",
    planned: "Planned",
    actual: "Actual",
    expected: "Asked for",
    recorded: "Recorded",
  },
} as const;

/** `"7"` → `"the last 7 days"`, for a sentence rather than a control. */
export function rangeSentence(range: AnalyticsRange): string {
  return `the last ${range} days`;
}

/** `135` → `"2h 15m"`. A duration, through the one formatter that spells them. */
export function duration(minutes: number): string {
  return formatDuration(minutes);
}

/** `0.62` → `"62%"`. Null renders as an em dash: no data is not zero percent. */
export function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

/** `"2026-06-17"` → `"Jun 17"`, the axis and table label for a day. */
export function dayLabel(date: LocalDate): string {
  return formatLocalDate(date, "monthDay");
}

/** `"2026-06-17"` → `"Wednesday, June 17, 2026"`, for a heatmap cell's own text. */
export function longDayLabel(date: LocalDate): string {
  return formatLocalDate(date, "long");
}

/** `9` → `"09:00"`. The hour axis is 24-hour, like the calendar's gutter. */
export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}
