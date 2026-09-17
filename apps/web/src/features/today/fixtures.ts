import { fromLocal, ianaTimeZone, instant, localDate } from "@momentum/core/time";
import { levelProgress } from "@momentum/core/gamification";
import type {
  Habit,
  HabitCompletion,
  IanaTimeZone,
  Instant,
  LocalDate,
  Uuid,
} from "@momentum/core/types";

import type { CalendarItem } from "@/features/calendar/types";
import { buildTimeline, type TimelineSource } from "@/features/today/agenda";
import type { TodayHabit, TodayPageData, TodayProject, TodayTask } from "@/features/today/types";

/**
 * Test fixtures, kept in the feature directory so the copy guard scans their
 * strings too. New York throughout, so DST defects are catchable.
 */

export const TZ: IanaTimeZone = ianaTimeZone("America/New_York");

/** A Tuesday, well away from any transition. */
export const TODAY: LocalDate = localDate("2026-09-08");

export const WEEK: LocalDate[] = [
  "2026-09-07",
  "2026-09-08",
  "2026-09-09",
  "2026-09-10",
  "2026-09-11",
  "2026-09-12",
  "2026-09-13",
].map((day) => localDate(day));

/** A wall-clock reading on a local date, as the instant it resolves to. */
export function at(date: string, hours: number, minutes = 0, tz: IanaTimeZone = TZ): Instant {
  return fromLocal(localDate(date), hours * 60 + minutes, tz);
}

export const PROJECT: TodayProject = { name: "Research", color: "amber" };

const BASE_EVENT: Omit<CalendarItem, "id" | "blockId"> = {
  kind: "event",
  title: "Chemistry lecture",
  description: null,
  startAt: at("2026-09-08", 9),
  endAt: at("2026-09-08", 10),
  allDay: false,
  ownColor: null,
  color: "slate",
  completedAt: null,
  occurrence: null,
  work: null,
  habitId: null,
  habitRecordable: false,
};

export function eventItem(overrides: Partial<CalendarItem> & { id: string }): CalendarItem {
  return { ...BASE_EVENT, blockId: overrides.id, ...overrides };
}

export function workItem(
  overrides: Partial<CalendarItem> & { id: string; taskId?: Uuid },
): CalendarItem {
  const { taskId, ...rest } = overrides;
  const item: CalendarItem = {
    ...BASE_EVENT,
    blockId: overrides.id,
    kind: "work",
    title: "Analyse benchmarks",
    color: "amber",
    work: {
      taskId: taskId ?? `task-${overrides.id}`,
      taskTitle: "Analyse benchmarks",
      taskCompletedAt: null,
      taskDueDate: TODAY,
      taskEstimatedMinutes: 60,
      blockCount: 1,
      completesTask: true,
    },
    ...rest,
  };
  return item;
}

export function habitItem(overrides: Partial<CalendarItem> & { id: string }): CalendarItem {
  return {
    ...BASE_EVENT,
    blockId: overrides.id,
    kind: "habit",
    title: "Piano",
    color: "teal",
    habitId: "habit-1",
    habitRecordable: true,
    ...overrides,
  };
}

const BASE_TASK: Omit<TodayTask, "id"> = {
  title: "Draft the literature review",
  priority: 2,
  dueDate: TODAY,
  estimatedMinutes: 90,
  scheduledMinutes: 0,
  project: null,
  completedAt: null,
};

export function todayTask(overrides: Partial<TodayTask> & { id: string }): TodayTask {
  return { ...BASE_TASK, ...overrides };
}

const BASE_HABIT: Omit<Habit, "id"> = {
  userId: "user-1",
  name: "Piano",
  description: null,
  frequencyType: "daily",
  target: 1,
  unit: "count",
  activeDays: [],
  preferredStartTime: null,
  estimatedMinutes: 30,
  xpReward: 5,
  color: null,
  archivedAt: null,
  createdAt: instant("2026-01-01T00:00:00.000Z"),
  updatedAt: instant("2026-01-01T00:00:00.000Z"),
};

export function habit(overrides: Partial<Habit> & { id: string }): Habit {
  return { ...BASE_HABIT, ...overrides };
}

export function completion(habitId: string, date: LocalDate, amount = 1): HabitCompletion {
  return {
    id: `${habitId}:${date}`,
    habitId,
    userId: "user-1",
    completionDate: date,
    amount,
    sourceBlockId: null,
    completedAt: instant("2026-09-08T12:00:00.000Z"),
  };
}

export function todayHabit(overrides: Partial<TodayHabit> & { habit: Habit }): TodayHabit {
  return {
    day: { date: TODAY, state: "ahead", amount: 0, target: 1 },
    progress: { achieved: 0, target: 7, fraction: 0 },
    completions: [],
    ...overrides,
  };
}

/** Builds the timeline the way the server does, so tests never hand-place a row. */
export function timelineOf(items: readonly CalendarItem[], project: TodayProject | null = null) {
  const sources: TimelineSource[] = items.map((item) => ({
    item,
    project: item.kind === "work" ? project : null,
  }));
  return buildTimeline(sources, TODAY, TZ);
}

export function todayPage(overrides: Partial<TodayPageData> = {}): TodayPageData {
  return {
    serverNow: at("2026-09-08", 10, 30),
    timezone: TZ,
    today: TODAY,
    week: WEEK,
    dayPart: "morning",
    displayName: "Kevin",
    level: levelProgress(4200),
    xpToday: 40,
    timeline: [],
    tasks: [],
    overdue: [],
    candidates: [],
    habits: [],
    quests: [],
    completedTasksToday: 0,
    warnings: [],
    // An account that has scheduled before: the plain empty states.
    openTaskCount: 4,
    hasScheduledWork: true,
    ...overrides,
  };
}
