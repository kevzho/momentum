import { formatDuration, formatLocalDate } from "@momentum/core/time";
import type { AnalyticsRange } from "@momentum/core/analytics";
import type { LocalDate } from "@momentum/core/types";

/**
 * Every word `/analytics` says. `copy.test.ts` reads this file and the
 * comment-stripped source of the feature and fails on forbidden vocabulary:
 * time is recorded or tracked, never earned or lost; work is marked done,
 * never achieved; nothing explains why a number is what it is.
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
    /** Shown once above the sentences, so no single line reads as a softened verdict. */
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

/** `"7"` → `"the last 7 days"`. */
export function rangeSentence(range: AnalyticsRange): string {
  return `the last ${range} days`;
}

/** `135` → `"2h 15m"`. */
export function duration(minutes: number): string {
  return formatDuration(minutes);
}

/** `0.62` → `"62%"`. Null renders as an em dash: no data is not zero percent. */
export function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

/** `"2026-06-17"` → `"Jun 17"`. */
export function dayLabel(date: LocalDate): string {
  return formatLocalDate(date, "monthDay");
}

/** `"2026-06-17"` → `"Wednesday, June 17, 2026"`. */
export function longDayLabel(date: LocalDate): string {
  return formatLocalDate(date, "long");
}

/** `9` → `"09:00"`. */
export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}
