import { describeWarning, warningKey } from "@momentum/core/scheduling";
import { formatLocalDate } from "@momentum/core/time";
import type { LocalDate } from "@momentum/core/types";

import type { DayPart, NextUpReason, TimelineState, TodayRisk } from "@/features/today/types";

/**
 * Every word `/today` says.
 *
 * One module, for the reason `features/habits/copy.ts` and
 * `features/planning/copy.ts` are one module each: Domain Rule 7 is a
 * constraint on *language*, and a constraint on language can only be enforced
 * where the language lives. `copy.test.ts` reads this file and the
 * comment-stripped source of every other file in the feature and fails on the
 * vocabulary the rule forbids.
 *
 * The vocabulary this surface uses. A day's work is **left**, never owed. A
 * deadline has **passed**, and the task is **overdue** — a fact about a date,
 * which is what the database column means. A block is **done**, an item is
 * **earlier** or **now**. Nothing here tells the user what kind of person their
 * day made them, and nothing counts what they did not do.
 */

/* -------------------------------------------------------------------------- */
/* Header                                                                     */
/* -------------------------------------------------------------------------- */

const GREETINGS: Record<DayPart, string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
};

/**
 * "Good morning, Kevin" — or just "Good morning" for a profile with no name.
 *
 * The greeting is the page's one title and lives in `PageHeader`
 * (docs/DESIGN_SYSTEM.md — one heading per page, at every width).
 */
export function greeting(dayPart: DayPart, displayName: string): string {
  const name = displayName.trim();
  return name === "" ? GREETINGS[dayPart] : `${GREETINGS[dayPart]}, ${name}`;
}

/** "Saturday, September 5, 2026" — the date under the greeting. */
export function longDate(date: LocalDate): string {
  return formatLocalDate(date, "long");
}

/* -------------------------------------------------------------------------- */
/* Sections                                                                   */
/* -------------------------------------------------------------------------- */

export const TODAY_COPY = {
  nextUp: {
    title: "Next up",
    startFocus: "Start focus",
    complete: "Complete",
    completeTask: "Complete task",
    markHabit: "Mark habit done",
    reschedule: "Reschedule",
    now: "Happening now",
    /** A task offered because the day holds no scheduled time left. */
    unscheduled: "Nothing scheduled — this is due soonest",
    doneTitle: "That is everything for today",
    doneDescription: (completed: number) =>
      completed === 1
        ? "One thing finished today. The rest of the day is yours."
        : `${completed} things finished today. The rest of the day is yours.`,
    emptyTitle: "Today is open",
    emptyDescription: "Nothing is scheduled and nothing is due. Plan the week when you want to.",
    planWeek: "Plan the week",
    addTask: "Add a task",
  },

  timeline: {
    title: "Today",
    emptyTitle: "No time reserved today",
    emptyDescription: "Drag work onto the calendar to give it a slot.",
    openCalendar: "Open the calendar",
    allDay: "All day",
    /** A block that began yesterday, or runs into tomorrow. */
    fromYesterday: "from yesterday",
    intoTomorrow: "into tomorrow",
    done: "Done",
  },

  tasks: {
    title: "Due today",
    emptyTitle: "Nothing due today without a slot",
    emptyDescription: "Everything due today already has time reserved.",
  },

  habits: {
    title: "Habits",
    emptyTitle: "No habits today",
    emptyDescription: "Habits you keep will appear here on the days they ask for.",
    /** The count beside the heading: how many of today's habits are met. */
    count: (met: number, total: number) => `${met}/${total}`,
  },

  quests: {
    title: "Quests",
    emptyTitle: "No quests today",
    emptyDescription: "Quests arrive each morning, in your own timezone.",
    claim: "Claim",
    claimed: "Claimed",
    count: (done: number, total: number) => `${done}/${total}`,
  },

  risk: {
    title: "At risk",
    /** The heading count, so the section states its own size before it is read. */
    count: (n: number) => (n === 1 ? "1 item" : `${n} items`),
    seeAll: "See all tasks",
  },

  progress: {
    level: (level: number) => `Level ${level}`,
    intoLevel: (into: number, span: number) => `${into} / ${span} XP`,
    earnedToday: (xp: number) => `+${xp} XP today`,
    noneToday: "No XP yet today",
  },

  reschedule: {
    title: "Reschedule",
    date: "Date",
    start: "Start",
    duration: "Minutes",
    submit: "Move",
    cancel: "Cancel",
    pickDate: "Choose a date.",
    pickStart: "Choose a start time.",
    pastMidnight: "That runs past midnight. Shorten it or start earlier.",
  },
} as const;

/* -------------------------------------------------------------------------- */
/* Timeline                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The state as a word, so the timeline never signals past, current and future
 * by colour alone (docs/DESIGN_SYSTEM.md — accessibility floor).
 */
export const TIMELINE_STATE_LABELS: Record<TimelineState, string> = {
  past: "Earlier",
  current: "Now",
  future: "Later",
};

/* -------------------------------------------------------------------------- */
/* Next up                                                                    */
/* -------------------------------------------------------------------------- */

/** Why the offered task is the one being offered. A date, never a verdict. */
export function nextUpReasonLabel(reason: NextUpReason, dueDate: LocalDate | null): string {
  switch (reason) {
    case "overdue":
      return dueDate === null
        ? "Deadline passed"
        : `Was due ${formatLocalDate(dueDate, "monthDay")}`;
    case "due-today":
      return "Due today";
    case "due-soon":
      return dueDate === null ? "Due soon" : `Due ${formatLocalDate(dueDate, "monthDay")}`;
    case "undated":
      return "No deadline";
  }
}

/* -------------------------------------------------------------------------- */
/* At risk                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A stable key per row, so a list does not re-key as the page refreshes.
 * The two warnings reuse the engine's own key for the same reason.
 */
export function riskKey(risk: TodayRisk): string {
  return risk.kind === "overdue" ? `overdue:${risk.task.id}` : warningKey(risk.warning);
}

/**
 * One factual sentence per row.
 *
 * The two warnings are `describeWarning`'s, verbatim — the engine already
 * writes them, they are already tested against the forbidden vocabulary, and a
 * second phrasing here would be a second thing to keep in step. The overdue
 * sentence states the deadline and how long ago it was, and says nothing else.
 */
export function describeRisk(risk: TodayRisk): string {
  if (risk.kind !== "overdue") return describeWarning(risk.warning);

  const due = formatLocalDate(risk.dueDate, "monthDay");
  if (risk.daysOverdue === 1) return `${risk.task.title} was due yesterday, ${due}.`;
  return `${risk.task.title} was due ${due}, ${risk.daysOverdue} days ago.`;
}
