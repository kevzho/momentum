import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ianaTimeZone, instant, localTime } from "@momentum/core/time";
import type { Profile, WorkingHours } from "@momentum/core/types";

import type { ActionResult } from "@/lib/actions/result";

const { errorToast, reportError, updateProfileSettingsMock, notificationPreference } = vi.hoisted(
  () => ({
    errorToast: vi.fn(),
    reportError: vi.fn(),
    updateProfileSettingsMock: vi.fn(),
    notificationPreference: {
      supported: true,
      enabled: false,
      permission: "default" as "default" | "granted" | "denied",
      setEnabled: vi.fn(),
    },
  }),
);

vi.mock("@momentum/ui/components/toast", () => ({
  toast: {
    error: errorToast,
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock("@/features/settings/actions", () => ({
  updateProfileSettings: updateProfileSettingsMock,
}));

vi.mock("@/lib/report-error", () => ({ reportError }));

vi.mock("@/lib/notifications/focus-notification", () => ({
  useFocusNotificationPreference: () => notificationPreference,
}));

// The theme control needs the shell's provider.
vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => null,
}));

const { SettingsView } = await import("@/features/settings/components/settings-view");
const { ErrorBoundary } = await import("@/components/error-boundary");

beforeEach(() => {
  updateProfileSettingsMock.mockReset();
  errorToast.mockClear();
  reportError.mockClear();
  notificationPreference.supported = true;
  notificationPreference.enabled = false;
  notificationPreference.permission = "default";
  notificationPreference.setEnabled.mockReset().mockResolvedValue(undefined);
});

const window = (start: string, end: string) => ({ start: localTime(start), end: localTime(end) });

const HOURS: WorkingHours = {
  0: [],
  1: [window("09:00", "17:00")],
  2: [window("09:00", "17:00")],
  3: [window("09:00", "17:00")],
  4: [window("09:00", "17:00")],
  5: [window("09:00", "17:00")],
  6: [],
};

const PROFILE: Profile = {
  id: "11111111-1111-4111-8111-111111111111",
  displayName: "Demo Ross",
  timezone: ianaTimeZone("America/New_York"),
  weekStart: 1,
  workingHours: HOURS,
  focusWindows: [window("09:00", "12:00")],
  snapMinutes: 15,
  level: 1,
  xp: 0,
  coins: 0,
  workingHoursSetAt: null,
  onboardingDismissedAt: null,
  createdAt: instant("2026-09-01T00:00:00.000Z"),
  updatedAt: instant("2026-09-01T00:00:00.000Z"),
};

const DEFAULTS = {
  displayName: PROFILE.displayName,
  timezone: PROFILE.timezone,
  weekStart: PROFILE.weekStart,
  snapMinutes: PROFILE.snapMinutes,
  workingHours: PROFILE.workingHours,
  focusWindows: PROFILE.focusWindows,
};

function succeedWith(profile: Profile) {
  updateProfileSettingsMock.mockResolvedValue({
    ok: true,
    data: profile,
  } satisfies ActionResult<Profile>);
}

function failWith(message: string) {
  updateProfileSettingsMock.mockResolvedValue({
    ok: false,
    error: { code: "validation", message },
  } satisfies ActionResult<Profile>);
}

function deferred<T>() {
  let settle: (value: T) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle: (value: T) => settle(value) };
}

describe("working hours", () => {
  it("sends the whole object as one field when a window changes", async () => {
    const next = { ...HOURS, 1: [window("10:00", "17:00")] };
    succeedWith({ ...PROFILE, workingHours: next });
    render(<SettingsView defaults={DEFAULTS} />);

    const start = screen.getByLabelText("Monday window 1 start");
    fireEvent.change(start, { target: { value: "10:00" } });
    fireEvent.blur(start);

    await waitFor(() => expect(updateProfileSettingsMock).toHaveBeenCalledTimes(1));
    expect(updateProfileSettingsMock).toHaveBeenCalledWith({ workingHours: next });
    expect(errorToast).not.toHaveBeenCalled();
  });

  it("shows the server's message and goes back on failure", async () => {
    failWith("Momentum could not save that change. Please try again.");
    render(<SettingsView defaults={DEFAULTS} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove Monday window 1" }));
    expect(screen.getAllByText("Day off")).toHaveLength(3);

    await waitFor(() =>
      expect(errorToast).toHaveBeenCalledWith(
        "Momentum could not save that change. Please try again.",
      ),
    );
    await waitFor(() => expect(screen.getAllByText("Day off")).toHaveLength(2));
    expect(screen.getByLabelText("Monday window 1 start")).toHaveProperty("value", "09:00");
  });

  it("shows what was actually stored when the server merged the windows", async () => {
    // Tuesday gains a window that overlaps its first; the schema merges them.
    const merged = { ...HOURS, 2: [window("09:00", "21:00")] };
    succeedWith({ ...PROFILE, workingHours: merged });
    render(<SettingsView defaults={DEFAULTS} />);

    fireEvent.click(screen.getByRole("button", { name: "Add Tuesday window" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Tuesday window 1 end")).toHaveProperty("value", "21:00"),
    );
    expect(screen.queryByLabelText("Tuesday window 2 start")).toBeNull();
  });

  it("disables only the editor that started the write while it is in flight", async () => {
    const pending = deferred<ActionResult<Profile>>();
    updateProfileSettingsMock.mockReturnValue(pending.promise);
    render(<SettingsView defaults={DEFAULTS} />);

    fireEvent.click(screen.getByRole("button", { name: "Add Saturday window" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Remove Monday window 1" })).toHaveProperty(
        "disabled",
        true,
      ),
    );
    // A different field with its own write; it stays live.
    expect(screen.getByRole("button", { name: "Remove Focus window 1" })).toHaveProperty(
      "disabled",
      false,
    );

    pending.settle({
      ok: true,
      data: { ...PROFILE, workingHours: { ...HOURS, 6: [window("09:00", "17:00")] } },
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Remove Monday window 1" })).toHaveProperty(
        "disabled",
        false,
      ),
    );
  });
});

describe("focus windows", () => {
  it("sends the list as its own field", async () => {
    const next = [window("09:00", "12:00"), window("13:00", "16:00")];
    succeedWith({ ...PROFILE, focusWindows: next });
    render(<SettingsView defaults={DEFAULTS} />);

    fireEvent.click(screen.getByRole("button", { name: "Add Focus window" }));

    await waitFor(() => expect(updateProfileSettingsMock).toHaveBeenCalledTimes(1));
    expect(updateProfileSettingsMock).toHaveBeenCalledWith({ focusWindows: next });
  });

  it("removes the last one and reads as none", async () => {
    succeedWith({ ...PROFILE, focusWindows: [] });
    render(<SettingsView defaults={DEFAULTS} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove Focus window 1" }));

    await waitFor(() =>
      expect(updateProfileSettingsMock).toHaveBeenCalledWith({ focusWindows: [] }),
    );
    expect(screen.getByText("None")).toBeDefined();
  });
});

describe("timezone", () => {
  it("offers every IANA zone through a searchable list and sends the chosen one", async () => {
    const auckland = ianaTimeZone("Pacific/Auckland");
    succeedWith({ ...PROFILE, timezone: auckland });
    render(<SettingsView defaults={DEFAULTS} />);

    const trigger = screen.getByRole("combobox", { name: "Timezone" });
    expect(trigger.textContent).toContain("America/New_York");
    trigger.focus();
    fireEvent.click(trigger);

    const search = await screen.findByRole("combobox", { name: "Search timezones" });
    fireEvent.change(search, { target: { value: "auckland" } });

    fireEvent.click(await screen.findByRole("option", { name: "Pacific/Auckland" }));

    await waitFor(() =>
      expect(updateProfileSettingsMock).toHaveBeenCalledWith({ timezone: "Pacific/Auckland" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Timezone" }).textContent).toContain(
        "Pacific/Auckland",
      ),
    );
    // Focus went back to the control, not to <body>.
    expect(screen.queryByRole("option", { name: "Pacific/Auckland" })).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
  });

  it("lists far more than a handful of zones", async () => {
    render(<SettingsView defaults={DEFAULTS} />);

    fireEvent.click(screen.getByRole("combobox", { name: "Timezone" }));

    const options = await screen.findAllByRole("option");
    expect(options.length).toBeGreaterThan(300);
    expect(options[0]?.textContent).toBe("America/New_York");
  });

  it("does not send the zone already stored", async () => {
    render(<SettingsView defaults={DEFAULTS} />);

    fireEvent.click(screen.getByRole("combobox", { name: "Timezone" }));
    fireEvent.click(await screen.findByRole("option", { name: "America/New_York" }));

    expect(updateProfileSettingsMock).not.toHaveBeenCalled();
  });
});

describe("focus-end notification", () => {
  it("is one switch that hands the choice to the preference", () => {
    render(<SettingsView defaults={DEFAULTS} />);

    // The focus-end switch and the reminders switch; each hands its choice to its own preference.
    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(2);
    const control = screen.getByRole("switch", { name: "Notify me when a focus session ends" });
    expect(control).toHaveProperty("disabled", false);
    expect(control.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(control);

    expect(notificationPreference.setEnabled).toHaveBeenCalledWith(true);
    // Nothing on the profile: the preference is per-device.
    expect(updateProfileSettingsMock).not.toHaveBeenCalled();
  });

  it("reads as on when the preference says so", () => {
    notificationPreference.enabled = true;
    notificationPreference.permission = "granted";
    render(<SettingsView defaults={DEFAULTS} />);

    const control = screen.getByRole("switch", { name: "Notify me when a focus session ends" });
    expect(control.getAttribute("aria-checked")).toBe("true");
    expect(control.getAttribute("aria-describedby")).toBeNull();

    fireEvent.click(control);

    expect(notificationPreference.setEnabled).toHaveBeenCalledWith(false);
  });

  it("is disabled, with the reason, where the browser has no Notification API", () => {
    notificationPreference.supported = false;
    render(<SettingsView defaults={DEFAULTS} />);

    const control = screen.getByRole("switch", { name: "Notify me when a focus session ends" });
    expect(control).toHaveProperty("disabled", true);
    expect(control.getAttribute("aria-describedby")).toBe("focus-end-notification-note");
    // Both notification switches explain the same missing API.
    expect(screen.getAllByText("This browser does not support notifications.")).toHaveLength(2);
  });

  it("says that permission was refused, and leaves the switch live for a retry", () => {
    notificationPreference.permission = "denied";
    render(<SettingsView defaults={DEFAULTS} />);

    const control = screen.getByRole("switch", { name: "Notify me when a focus session ends" });
    expect(control).toHaveProperty("disabled", false);
    expect(control.getAttribute("aria-checked")).toBe("false");
    expect(
      screen.getByText("Notifications are blocked for Momentum in this browser's settings."),
    ).toBeDefined();
  });

  it("reports a preference that rejects rather than blanking the page", async () => {
    notificationPreference.setEnabled.mockRejectedValue(new Error("boom"));
    render(
      <ErrorBoundary section="Settings">
        <SettingsView defaults={DEFAULTS} />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole("switch", { name: "Notify me when a focus session ends" }));

    await waitFor(() => expect(reportError).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("data export", () => {
  it("is a real download link to the export route, not a fetch", () => {
    render(<SettingsView defaults={DEFAULTS} />);

    const link = screen.getByRole("link", { name: "Download your data" });
    expect(link.getAttribute("href")).toBe("/api/export");
    expect(link.hasAttribute("download")).toBe(true);
  });
});

describe("display name", () => {
  it("is sent when the field is left with a different, trimmed value", async () => {
    succeedWith({ ...PROFILE, displayName: "D. Ross" });
    render(<SettingsView defaults={DEFAULTS} />);

    const field = screen.getByLabelText("Display name");
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "  D. Ross " } });
    fireEvent.blur(field);

    await waitFor(() =>
      expect(updateProfileSettingsMock).toHaveBeenCalledWith({ displayName: "D. Ross" }),
    );
  });

  it("is not sent when nothing changed", () => {
    render(<SettingsView defaults={DEFAULTS} />);

    const field = screen.getByLabelText("Display name");
    fireEvent.focus(field);
    fireEvent.blur(field);

    expect(updateProfileSettingsMock).not.toHaveBeenCalled();
  });

  it("abandons the edit on Escape rather than committing it", () => {
    render(<SettingsView defaults={DEFAULTS} />);

    const field = screen.getByLabelText<HTMLInputElement>("Display name");
    // Genuinely focused, so the component's own `blur()` really dispatches
    // synchronously, before React re-renders with the reset draft.
    field.focus();
    expect(document.activeElement).toBe(field);
    fireEvent.change(field, { target: { value: "DELETE ME" } });
    fireEvent.keyDown(field, { key: "Escape" });

    expect(updateProfileSettingsMock).not.toHaveBeenCalled();
    expect(field.value).toBe("Demo Ross");
  });

  it("commits again after an abandoned edit", () => {
    succeedWith({ ...PROFILE, displayName: "D. Ross" });
    render(<SettingsView defaults={DEFAULTS} />);

    const field = screen.getByLabelText<HTMLInputElement>("Display name");
    field.focus();
    fireEvent.change(field, { target: { value: "DELETE ME" } });
    fireEvent.keyDown(field, { key: "Escape" });

    // A leaked flag would silently swallow every later commit on the field.
    field.focus();
    fireEvent.change(field, { target: { value: "D. Ross" } });
    fireEvent.blur(field);

    expect(updateProfileSettingsMock).toHaveBeenCalledWith({ displayName: "D. Ross" });
  });
});

describe("when the write rejects instead of returning", () => {
  it("goes back, shows the unreachable message, and releases the control", async () => {
    updateProfileSettingsMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(
      <ErrorBoundary section="Settings">
        <SettingsView defaults={DEFAULTS} />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove Monday window 1" }));
    expect(screen.getAllByText("Day off")).toHaveLength(3);

    await waitFor(() =>
      expect(errorToast).toHaveBeenCalledWith(
        "Momentum could not reach the server. Your change was not saved.",
      ),
    );
    await waitFor(() => expect(screen.getAllByText("Day off")).toHaveLength(2));

    // The boundary never saw it.
    expect(screen.queryByRole("alert")).toBeNull();

    // The pending key is deleted on the caught path too.
    expect(screen.getByRole("button", { name: "Remove Monday window 1" })).toHaveProperty(
      "disabled",
      false,
    );

    expect(reportError).toHaveBeenCalledTimes(1);
  });
});
