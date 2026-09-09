import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FOCUS_NOTIFICATION_KEY,
  notifyFocusEnded,
  useFocusNotificationPreference,
} from "@/lib/notifications/focus-notification";

// jsdom has no Notification API: "unsupported" is the environment as found,
// and the supported case is this stand-in.
class FakeNotification {
  static permission: NotificationPermission = "default";
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

function installNotification(permission: NotificationPermission): void {
  FakeNotification.permission = permission;
  FakeNotification.instances = [];
  FakeNotification.requestPermission.mockClear();
  vi.stubGlobal("Notification", FakeNotification);
}

function Probe() {
  const preference = useFocusNotificationPreference();
  return (
    <div>
      <span data-testid="state">
        {`${preference.supported}/${preference.enabled}/${preference.permission}`}
      </span>
      <button type="button" onClick={() => void preference.setEnabled(true)}>
        on
      </button>
      <button type="button" onClick={() => void preference.setEnabled(false)}>
        off
      </button>
    </div>
  );
}

function state(): string {
  return screen.getByTestId("state").textContent ?? "";
}

/** Presses the switch and lets the permission request settle. */
async function press(name: "on" | "off"): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useFocusNotificationPreference", () => {
  it("reports unsupported, and switching on does nothing, where the API is missing", async () => {
    render(<Probe />);
    expect(state()).toBe("false/false/default");

    await press("on");

    expect(state()).toBe("false/false/default");
    expect(window.localStorage.getItem(FOCUS_NOTIFICATION_KEY)).toBeNull();
  });

  it("asks for permission on the first enable and stores the preference once granted", async () => {
    installNotification("default");
    FakeNotification.requestPermission.mockImplementation(() => {
      FakeNotification.permission = "granted";
      return Promise.resolve("granted");
    });
    render(<Probe />);
    expect(state()).toBe("true/false/default");

    await press("on");

    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(FOCUS_NOTIFICATION_KEY)).toBe("true");
    expect(state()).toBe("true/true/granted");
  });

  it("stays off when permission is refused", async () => {
    installNotification("default");
    FakeNotification.requestPermission.mockImplementation(() => {
      FakeNotification.permission = "denied";
      return Promise.resolve("denied");
    });
    render(<Probe />);

    await press("on");

    expect(window.localStorage.getItem(FOCUS_NOTIFICATION_KEY)).toBeNull();
    expect(state()).toBe("true/false/denied");
  });

  it("does not ask again once granted, and switching off forgets the preference", async () => {
    installNotification("granted");
    window.localStorage.setItem(FOCUS_NOTIFICATION_KEY, "true");
    render(<Probe />);
    expect(state()).toBe("true/true/granted");

    await press("off");
    expect(state()).toBe("true/false/granted");
    expect(window.localStorage.getItem(FOCUS_NOTIFICATION_KEY)).toBeNull();

    await press("on");
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
    expect(state()).toBe("true/true/granted");
  });

  it("reads a stored preference as off while permission is not granted", () => {
    installNotification("denied");
    window.localStorage.setItem(FOCUS_NOTIFICATION_KEY, "true");
    render(<Probe />);

    expect(state()).toBe("true/false/denied");
  });
});

describe("notifyFocusEnded", () => {
  it("shows a tagged notification that closes itself and focuses the window when clicked", () => {
    installNotification("granted");
    window.localStorage.setItem(FOCUS_NOTIFICATION_KEY, "true");
    const focus = vi.spyOn(window, "focus").mockImplementation(() => {});

    notifyFocusEnded("History essay");

    expect(FakeNotification.instances).toHaveLength(1);
    const [shown] = FakeNotification.instances;
    expect(shown?.title).toBe("Focus session finished");
    expect(shown?.options).toEqual({ body: "History essay", tag: "momentum-focus" });

    shown?.onclick?.();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(shown?.close).toHaveBeenCalledTimes(1);
  });

  it("does nothing while the preference is off, permission is missing, or the API is absent", () => {
    notifyFocusEnded("History essay");

    installNotification("granted");
    notifyFocusEnded("History essay");
    expect(FakeNotification.instances).toHaveLength(0);

    installNotification("default");
    window.localStorage.setItem(FOCUS_NOTIFICATION_KEY, "true");
    notifyFocusEnded("History essay");
    expect(FakeNotification.instances).toHaveLength(0);
  });

  it("survives a constructor that refuses to run", () => {
    installNotification("granted");
    window.localStorage.setItem(FOCUS_NOTIFICATION_KEY, "true");
    vi.stubGlobal(
      "Notification",
      Object.assign(
        class {
          static permission: NotificationPermission = "granted";
          constructor() {
            throw new TypeError("Illegal constructor");
          }
        },
        { requestPermission: FakeNotification.requestPermission },
      ),
    );

    expect(() => notifyFocusEnded("History essay")).not.toThrow();
  });
});
