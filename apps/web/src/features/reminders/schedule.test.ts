import { describe, expect, it } from "vitest";

import { ianaTimeZone, instant, localDate, localTime } from "@momentum/core/time";
import type { Uuid } from "@momentum/core/types";

import {
  DEFAULT_PREFERENCES,
  buildReminders,
  delayMs,
  pendingReminders,
} from "@/features/reminders/schedule";
import type { ReminderFeed } from "@/features/reminders/types";

// New York, a Thursday in September: EDT, so local 09:00 is 13:00Z.
const TZ = ianaTimeZone("America/New_York");
const TODAY = localDate("2026-09-17");

function feed(overrides: Partial<ReminderFeed> = {}): ReminderFeed {
  return {
    today: TODAY,
    timezone: TZ,
    events: [],
    tasks: [],
    overdue: [],
    courseItems: [],
    ...overrides,
  };
}

const LECTURE = {
  id: "lecture",
  title: "Statistics lecture",
  startAt: instant("2026-09-17T13:00:00.000Z"),
  endAt: instant("2026-09-17T14:30:00.000Z"),
  allDay: false,
};

const EXAM_DAY = {
  id: "exam",
  title: "Chem test",
  startAt: instant("2026-09-17T04:00:00.000Z"),
  endAt: instant("2026-09-18T04:00:00.000Z"),
  allDay: true,
};

const PS3 = {
  id: "11111111-1111-4111-8111-111111111111" as Uuid,
  title: "Problem set 3",
  dueDate: localDate("2026-09-18"),
  courseCode: "STAT 201",
  projectName: "Statistics",
};

describe("buildReminders", () => {
  it("reminds of a timed event the chosen minutes before it starts, with its time and length", () => {
    const [reminder] = buildReminders(feed({ events: [LECTURE] }), DEFAULT_PREFERENCES);
    expect(reminder).toMatchObject({
      key: "event:lecture:2026-09-17T13:00:00.000Z",
      at: "2026-09-17T12:50:00.000Z",
      title: "Statistics lecture",
      body: "Starts at 09:00 · 1h 30m",
      href: "/calendar",
    });

    const [thirty] = buildReminders(feed({ events: [LECTURE] }), {
      ...DEFAULT_PREFERENCES,
      eventLeadMinutes: 30,
    });
    expect(thirty?.at).toBe("2026-09-17T12:30:00.000Z");
  });

  it("puts an all-day event in the morning summary rather than before a clock time", () => {
    const reminders = buildReminders(feed({ events: [EXAM_DAY] }), DEFAULT_PREFERENCES);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({
      key: "digest:2026-09-17",
      at: "2026-09-17T13:00:00.000Z",
      title: "Today",
      body: "Chem test (all day)",
      href: "/today",
    });
  });

  it("summarises the morning as counts, in the profile's time, and says nothing on an empty day", () => {
    expect(buildReminders(feed(), DEFAULT_PREFERENCES)).toEqual([]);

    const reminders = buildReminders(
      feed({
        tasks: [
          { ...PS3, id: "22222222-2222-4222-8222-222222222222" as Uuid, dueDate: TODAY },
          { ...PS3, id: "33333333-3333-4333-8333-333333333333" as Uuid, dueDate: TODAY },
          PS3,
        ],
        overdue: [{ ...PS3, id: "44444444-4444-4444-8444-444444444444" as Uuid }],
        courseItems: [
          {
            id: "55555555-5555-4555-8555-555555555555" as Uuid,
            title: "Read chapter 4",
            courseCode: "STAT 201",
            courseName: "Statistics",
            plannedOn: TODAY,
            done: false,
          },
        ],
      }),
      { ...DEFAULT_PREFERENCES, digestTime: localTime("07:30") },
    );

    const digest = reminders.find((reminder) => reminder.key === "digest:2026-09-17");
    expect(digest?.at).toBe("2026-09-17T11:30:00.000Z");
    expect(digest?.body).toBe("2 tasks due · 1 overdue · 1 course item planned");
  });

  it("names what is due tomorrow in the evening, with the course code, and drops done items", () => {
    const reminders = buildReminders(
      feed({
        tasks: [PS3],
        courseItems: [
          {
            id: "55555555-5555-4555-8555-555555555555" as Uuid,
            title: "Read chapter 4",
            courseCode: "STAT 201",
            courseName: "Statistics",
            plannedOn: TODAY,
            done: true,
          },
        ],
      }),
      DEFAULT_PREFERENCES,
    );

    // Nothing planned and open today, so no morning summary; the evening names tomorrow.
    expect(reminders.map((reminder) => reminder.key)).toEqual(["evening:2026-09-17"]);
    expect(reminders[0]).toMatchObject({
      at: "2026-09-17T22:00:00.000Z",
      body: "Due tomorrow: Problem set 3 (STAT 201)",
    });
  });

  it("orders reminders by when they fire", () => {
    const keys = buildReminders(
      feed({ events: [LECTURE, EXAM_DAY], tasks: [PS3] }),
      DEFAULT_PREFERENCES,
    ).map((reminder) => reminder.key);
    expect(keys).toEqual([
      "event:lecture:2026-09-17T13:00:00.000Z",
      "digest:2026-09-17",
      "evening:2026-09-17",
    ]);
  });
});

describe("pendingReminders", () => {
  const reminders = buildReminders(feed({ events: [LECTURE], tasks: [PS3] }), DEFAULT_PREFERENCES);

  it("keeps what is ahead and what just passed within the grace window, and drops what was shown", () => {
    const now = instant("2026-09-17T12:52:00.000Z");
    expect(pendingReminders(reminders, now, () => false).map((r) => r.key)).toEqual([
      "event:lecture:2026-09-17T13:00:00.000Z",
      "evening:2026-09-17",
    ]);
    expect(
      pendingReminders(reminders, now, (key) => key.startsWith("event:")).map((r) => r.key),
    ).toEqual(["evening:2026-09-17"]);

    const later = instant("2026-09-17T12:54:00.000Z");
    expect(pendingReminders(reminders, later, () => false).map((r) => r.key)).toEqual([
      "evening:2026-09-17",
    ]);
  });
});

describe("delayMs", () => {
  it("is the wait until the moment, and zero once it has passed", () => {
    const now = instant("2026-09-17T12:00:00.000Z");
    expect(delayMs(now, instant("2026-09-17T12:10:00.000Z"))).toBe(600_000);
    expect(delayMs(now, instant("2026-09-17T11:59:00.000Z"))).toBe(0);
  });
});
