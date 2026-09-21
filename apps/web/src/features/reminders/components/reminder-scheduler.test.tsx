import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ianaTimeZone, instant, localDate } from "@momentum/core/time";

import type { ReminderFeed } from "@/features/reminders/types";
import { REMINDERS_KEY, SHOWN_KEY } from "@/lib/notifications/reminders";

const { loadReminderFeed, pushMock } = vi.hoisted(() => ({
  loadReminderFeed: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("@/features/reminders/actions", () => ({ loadReminderFeed }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
}));

const { ReminderScheduler } = await import("@/features/reminders/components/reminder-scheduler");

class FakeNotification {
  static permission: NotificationPermission = "granted";
  static requestPermission = vi.fn(() => Promise.resolve(FakeNotification.permission));
  static instances: FakeNotification[] = [];

  onclick: (() => void) | null = null;
  close = vi.fn();

  constructor(
    public title: string,
    public options?: NotificationOptions,
  ) {
    FakeNotification.instances.push(this);
  }
}

// 12:50Z on the feed's day: ten minutes before the 13:00Z lecture, in New York's morning.
const NOW = instant("2026-09-17T12:49:30.000Z");

function feed(): ReminderFeed {
  return {
    today: localDate("2026-09-17"),
    timezone: ianaTimeZone("America/New_York"),
    events: [
      {
        id: "lecture",
        title: "Statistics lecture",
        startAt: instant("2026-09-17T13:00:00.000Z"),
        endAt: instant("2026-09-17T14:30:00.000Z"),
        allDay: false,
      },
    ],
    tasks: [],
    overdue: [],
    courseItems: [],
  };
}

function enable(): void {
  window.localStorage.setItem(
    REMINDERS_KEY,
    JSON.stringify({
      enabled: true,
      preferences: { eventLeadMinutes: 10, digestTime: "09:00", eveningTime: "18:00" },
    }),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse(NOW));
  FakeNotification.instances = [];
  vi.stubGlobal("Notification", FakeNotification);
  window.localStorage.clear();
  loadReminderFeed.mockResolvedValue({ ok: true, data: feed() });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ReminderScheduler", () => {
  it("shows an event reminder at its moment, once, and records it", async () => {
    enable();
    render(<ReminderScheduler initialFeed={feed()} />);

    // Not yet: the reminder is thirty seconds out.
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    expect(FakeNotification.instances).toHaveLength(0);

    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    expect(FakeNotification.instances).toHaveLength(1);
    expect(FakeNotification.instances[0]).toMatchObject({
      title: "Statistics lecture",
      options: { body: "Starts at 09:00 · 1h 30m", tag: "event:lecture:2026-09-17T13:00:00.000Z" },
    });
    expect(JSON.parse(window.localStorage.getItem(SHOWN_KEY) ?? "{}")).toHaveProperty(
      "event:lecture:2026-09-17T13:00:00.000Z",
    );

    // Time passes, the clock ticks, nothing repeats.
    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });
    expect(FakeNotification.instances).toHaveLength(1);
  });

  it("opens the page the reminder points at when clicked", async () => {
    enable();
    render(<ReminderScheduler initialFeed={feed()} />);
    await act(async () => {
      vi.advanceTimersByTime(40_000);
    });
    const shown = FakeNotification.instances[0];
    expect(shown).toBeDefined();
    shown?.onclick?.();
    expect(pushMock).toHaveBeenCalledWith("/calendar");
    expect(shown?.close).toHaveBeenCalled();
  });

  it("shows nothing while reminders are off, or when another tab already showed it", async () => {
    render(<ReminderScheduler initialFeed={feed()} />);
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(FakeNotification.instances).toHaveLength(0);

    enable();
    window.localStorage.setItem(
      SHOWN_KEY,
      JSON.stringify({ "event:lecture:2026-09-17T13:00:00.000Z": Date.now() }),
    );
    render(<ReminderScheduler initialFeed={feed()} />);
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(FakeNotification.instances).toHaveLength(0);
  });

  it("re-reads the feed every few minutes while visible", async () => {
    enable();
    render(<ReminderScheduler initialFeed={feed()} />);
    expect(loadReminderFeed).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000 + 10);
    });
    expect(loadReminderFeed).toHaveBeenCalledTimes(1);
  });
});
