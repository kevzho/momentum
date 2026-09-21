import type { IanaTimeZone, Instant, LocalDate, LocalTime, Uuid } from "@momentum/core/types";

/**
 * What a reminder can be about, read on the server once per request and
 * refreshed by the scheduler while the app stays open. Every date is a
 * `LocalDate` in the profile timezone; every time is an instant.
 */

export interface ReminderEvent {
  id: string;
  title: string;
  startAt: Instant;
  endAt: Instant;
  allDay: boolean;
}

export interface ReminderTask {
  id: Uuid;
  title: string;
  dueDate: LocalDate;
  /** The course code when the task's project is a course; the name otherwise; null in the inbox. */
  courseCode: string | null;
  projectName: string | null;
}

export interface ReminderCourseItem {
  id: Uuid;
  title: string;
  courseCode: string | null;
  courseName: string;
  plannedOn: LocalDate;
  done: boolean;
}

/** Everything the scheduler decides from. `today` is the profile's today at read time. */
export interface ReminderFeed {
  today: LocalDate;
  timezone: IanaTimeZone;
  /** Timed and all-day events from today's start to tomorrow's end. */
  events: readonly ReminderEvent[];
  /** Open, top-level tasks due today or tomorrow. */
  tasks: readonly ReminderTask[];
  /** Open, top-level tasks whose deadline has passed. */
  overdue: readonly ReminderTask[];
  /** Course checklist entries planned for today, done ones included. */
  courseItems: readonly ReminderCourseItem[];
}

/** The per-device settings the scheduler reads. */
export interface ReminderPreferences {
  /** Minutes before a timed event starts. */
  eventLeadMinutes: number;
  /** When the morning summary fires, in the profile timezone. */
  digestTime: LocalTime;
  /** When the evening "still open" nudge fires. */
  eveningTime: LocalTime;
}

/** One notification the scheduler may show, identified by `key` so it shows once. */
export interface Reminder {
  key: string;
  at: Instant;
  title: string;
  body: string;
  /** Where a click on the notification lands. */
  href: "/today" | "/calendar" | "/courses";
}
