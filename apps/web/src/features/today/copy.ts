import { describeWarning, warningKey } from "@momentum/core/scheduling";
import { formatLocalDate } from "@momentum/core/time";
import type { LocalDate } from "@momentum/core/types";

import type { DayPart, NextUpReason, TimelineState, TodayRisk } from "@/features/today/types";

/**
 * Every user-facing string of `/today`, in one module; `copy.test.ts` scans it
 * and the feature's comment-stripped source for forbidden vocabulary. Work is
 * "left", never owed; a task is "overdue" as a fact about a date; nothing
 * counts what the user did not do.
 */

const GREETINGS: Record<DayPart, string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
};

/** "Good morning, Kevin" — or just "Good morning" for a profile with no name. */
export function greeting(dayPart: DayPart, displayName: string): string {
  const name = displayName.trim();
  return name === "" ? GREETINGS[dayPart] : `${GREETINGS[dayPart]}, ${name}`;
}

/** "Saturday, September 5, 2026" — the date under the greeting. */
export function longDate(date: LocalDate): string {
  return formatLocalDate(date, "long");
}

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
    /** A brand-new account: nothing to schedule yet. */
    captureTitle: "Capture what is on your mind",
    captureDescription: "Add the tasks you are carrying around. Giving them time comes after.",
    /** Tasks exist and none has ever had a slot. */
    scheduleTitle: "Give one a slot",
    scheduleDescription: (openTasks: number) =>
      openTasks === 1
        ? "One open task has no time reserved. Drag it onto the week, or let Find time pick a slot."
        : `${openTasks} open tasks have no time reserved. Drag one onto the week, or let Find time pick a slot.`,
  },

  timeline: {
    title: "Today",
    emptyTitle: "No time reserved today",
    emptyDescription: "Drag work onto the calendar to give it a slot.",
    /** A brand-new account: there is nothing to drag yet. */
    captureDescription: "Tasks you capture can be given time here.",
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

/** The state as a word, so the timeline never signals it by colour alone. */
export const TIMELINE_STATE_LABELS: Record<TimelineState, string> = {
  past: "Earlier",
  current: "Now",
  future: "Later",
};

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

/** A stable key per row, so the list does not re-key as the page refreshes. */
export function riskKey(risk: TodayRisk): string {
  return risk.kind === "overdue" ? `overdue:${risk.task.id}` : warningKey(risk.warning);
}

/** One factual sentence per row; engine warnings use `describeWarning` verbatim. */
export function describeRisk(risk: TodayRisk): string {
  if (risk.kind !== "overdue") return describeWarning(risk.warning);

  const due = formatLocalDate(risk.dueDate, "monthDay");
  if (risk.daysOverdue === 1) return `${risk.task.title} was due yesterday, ${due}.`;
  return `${risk.task.title} was due ${due}, ${risk.daysOverdue} days ago.`;
}
