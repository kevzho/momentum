import {
  addDays,
  addMinutes,
  durationMinutes,
  formatDuration,
  formatTime,
  fromLocal,
  localDateOf,
  localTime,
  minutesOfLocalTime,
} from "@momentum/core/time";
import type { Instant } from "@momentum/core/types";

import type {
  Reminder,
  ReminderFeed,
  ReminderPreferences,
  ReminderTask,
} from "@/features/reminders/types";

/**
 * Which notifications a feed calls for, and when. Pure: the same feed and
 * preferences give the same reminders, and the caller decides which are still
 * ahead and which were already shown. Three kinds:
 *
 * - an event, a chosen number of minutes before it starts;
 * - a morning summary of the day: what is due, what is planned, what is
 *   overdue — stated as counts, never as a verdict;
 * - an evening note of what is still open today and what is due tomorrow.
 *
 * A summary with nothing in it is not a reminder.
 */

export const DEFAULT_PREFERENCES: ReminderPreferences = {
  eventLeadMinutes: 10,
  digestTime: localTime("09:00"),
  eveningTime: localTime("18:00"),
};

/** The lead times the settings offer, in minutes. */
export const EVENT_LEAD_OPTIONS = [5, 10, 15, 30, 60] as const;

/** How long after its moment a reminder may still fire, for a tab that was asleep. */
export const GRACE_MINUTES = 3;

export function buildReminders(feed: ReminderFeed, prefs: ReminderPreferences): Reminder[] {
  const reminders: Reminder[] = [];
  const { today, timezone } = feed;
  const tomorrow = addDays(today, 1);

  for (const event of feed.events) {
    if (event.allDay) continue;
    reminders.push({
      key: `event:${event.id}:${event.startAt}`,
      at: addMinutes(event.startAt, -prefs.eventLeadMinutes),
      title: event.title,
      body: `Starts at ${formatTime(event.startAt, timezone)} · ${formatDuration(
        durationMinutes(event.startAt, event.endAt),
      )}`,
      href: "/calendar",
    });
  }

  const digest = digestBody(feed);
  if (digest !== null) {
    reminders.push({
      key: `digest:${today}`,
      at: fromLocal(today, minutesOfLocalTime(prefs.digestTime), timezone),
      title: "Today",
      body: digest,
      href: "/today",
    });
  }

  const evening = eveningBody(feed, tomorrow);
  if (evening !== null) {
    reminders.push({
      key: `evening:${today}`,
      at: fromLocal(today, minutesOfLocalTime(prefs.eveningTime), timezone),
      title: "Still open today",
      body: evening,
      href: "/today",
    });
  }

  return reminders.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/** "2 tasks due · 1 overdue · Chem test (all day) · 3 course items planned". */
function digestBody(feed: ReminderFeed): string | null {
  const dueToday = feed.tasks.filter((task) => task.dueDate === feed.today);
  const allDay = feed.events.filter(
    (event) => event.allDay && localDateOf(event.startAt, feed.timezone) === feed.today,
  );
  const planned = feed.courseItems.filter((item) => !item.done);

  const parts = [
    count(dueToday.length, "task due", "tasks due"),
    count(feed.overdue.length, "overdue", "overdue"),
    allDay.length === 0
      ? null
      : allDay.length <= 2
        ? allDay.map((event) => `${event.title} (all day)`).join(" · ")
        : `${allDay.length} all-day events`,
    count(planned.length, "course item planned", "course items planned"),
  ].filter((part): part is string => part !== null);

  return parts.length === 0 ? null : parts.join(" · ");
}

/** "1 task due today still open · 2 course items still open · Due tomorrow: Problem set 3 (STAT 201)". */
function eveningBody(feed: ReminderFeed, tomorrow: ReminderFeed["today"]): string | null {
  const openToday = feed.tasks.filter((task) => task.dueDate === feed.today);
  const openItems = feed.courseItems.filter((item) => !item.done);
  const dueTomorrow = feed.tasks.filter((task) => task.dueDate === tomorrow);

  const parts = [
    count(openToday.length, "task due today still open", "tasks due today still open"),
    count(openItems.length, "course item still open", "course items still open"),
    dueTomorrow.length === 0
      ? null
      : dueTomorrow.length <= 2
        ? `Due tomorrow: ${dueTomorrow.map(taskLabel).join(", ")}`
        : `${dueTomorrow.length} due tomorrow`,
  ].filter((part): part is string => part !== null);

  return parts.length === 0 ? null : parts.join(" · ");
}

function taskLabel(task: ReminderTask): string {
  return task.courseCode === null ? task.title : `${task.title} (${task.courseCode})`;
}

function count(n: number, one: string, many: string): string | null {
  if (n === 0) return null;
  return `${n} ${n === 1 ? one : many}`;
}

/** Reminders still ahead (or within the grace window) and not yet shown, soonest first. */
export function pendingReminders(
  reminders: readonly Reminder[],
  now: Instant,
  wasShown: (key: string) => boolean,
): Reminder[] {
  const earliest = addMinutes(now, -GRACE_MINUTES);
  return reminders.filter((reminder) => reminder.at >= earliest && !wasShown(reminder.key));
}

/** Milliseconds from `now` until `at`, never negative. Timer arithmetic, kept out of components. */
export function delayMs(now: Instant, at: Instant): number {
  return Math.max(0, epochMs(at) - epochMs(now));
}

/** An instant as epoch milliseconds, for the shown-keys store's timestamps. */
export function epochMs(instant: Instant): number {
  return Date.parse(instant);
}
