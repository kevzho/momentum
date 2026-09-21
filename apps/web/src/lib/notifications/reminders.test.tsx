import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  REMINDERS_KEY,
  SHOWN_KEY,
  coercePreferences,
  markReminderShown,
  useReminderPreference,
  wasReminderShown,
} from "@/lib/notifications/reminders";

// jsdom has no Notification API: "unsupported" is the environment as found,
// and the supported case is this stand-in.
class FakeNotification {
  static permission: NotificationPermission = "default";
  static requestPermission = vi.fn(() => Promise.resolve(FakeNotification.permission));
}

function installNotification(permission: NotificationPermission): void {
  FakeNotification.permission = permission;
  FakeNotification.requestPermission.mockClear();
  vi.stubGlobal("Notification", FakeNotification);
}

function Probe() {
  const preference = useReminderPreference();
  return (
    <div>
      <span data-testid="state">
        {`${preference.supported}/${preference.enabled}/${preference.permission}/${preference.preferences.eventLeadMinutes}/${preference.preferences.digestTime}`}
      </span>
      <button type="button" onClick={() => void preference.setEnabled(true)}>
        on
      </button>
      <button type="button" onClick={() => void preference.setEnabled(false)}>
        off
      </button>
      <button type="button" onClick={() => preference.update({ eventLeadMinutes: 30 })}>
        thirty
      </button>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useReminderPreference", () => {
  it("is off and unsupported where the browser has no Notification API", () => {
    render(<Probe />);
    expect(screen.getByTestId("state").textContent).toBe("false/false/default/10/09:00");
  });

  it("asks for permission the first time it is switched on, and stays off when refused", async () => {
    installNotification("default");
    render(<Probe />);

    FakeNotification.requestPermission.mockImplementationOnce(() => {
      FakeNotification.permission = "denied";
      return Promise.resolve("denied" as NotificationPermission);
    });
    await act(async () => {
      fireEvent.click(screen.getByText("on"));
    });

    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("state").textContent).toBe("true/false/denied/10/09:00");
  });

  it("turns on once granted, keeps its settings, and turns off without losing them", async () => {
    installNotification("granted");
    render(<Probe />);

    await act(async () => {
      fireEvent.click(screen.getByText("on"));
    });
    expect(screen.getByTestId("state").textContent).toBe("true/true/granted/10/09:00");

    act(() => {
      fireEvent.click(screen.getByText("thirty"));
    });
    expect(screen.getByTestId("state").textContent).toBe("true/true/granted/30/09:00");

    await act(async () => {
      fireEvent.click(screen.getByText("off"));
    });
    expect(screen.getByTestId("state").textContent).toBe("true/false/granted/30/09:00");
    expect(JSON.parse(window.localStorage.getItem(REMINDERS_KEY) ?? "{}")).toMatchObject({
      enabled: false,
      preferences: { eventLeadMinutes: 30 },
    });
  });
});

describe("coercePreferences", () => {
  it("takes only values the settings offer, and falls back field by field", () => {
    expect(
      coercePreferences({ eventLeadMinutes: 15, digestTime: "07:30", eveningTime: "x" }),
    ).toEqual({
      eventLeadMinutes: 15,
      digestTime: "07:30",
      eveningTime: "18:00",
    });
    expect(coercePreferences({ eventLeadMinutes: 7 }).eventLeadMinutes).toBe(10);
    expect(coercePreferences("garbage").digestTime).toBe("09:00");
  });
});

describe("the shown keys", () => {
  it("remembers a key for two days and forgets older ones", () => {
    const day = 24 * 60 * 60 * 1000;
    markReminderShown("digest:2026-09-15", 0);
    markReminderShown("digest:2026-09-17", 2 * day + 1);

    expect(wasReminderShown("digest:2026-09-17")).toBe(true);
    expect(wasReminderShown("digest:2026-09-15")).toBe(false);
    expect(Object.keys(JSON.parse(window.localStorage.getItem(SHOWN_KEY) ?? "{}"))).toEqual([
      "digest:2026-09-17",
    ]);
  });
});
