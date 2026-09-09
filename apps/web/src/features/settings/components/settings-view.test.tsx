import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ianaTimeZone, instant, localTime } from "@momentum/core/time";
import type { Profile, WorkingHours } from "@momentum/core/types";

import type { ActionResult } from "@/lib/actions/result";

/**
 * The wiring between the page's controls and its one action.
 *
 * Each control sends a patch naming only its own field; that is the whole
 * contract, and it is what these tests assert. A failed write — one the action
 * returns and one the call rejects alike — goes back to what it was, shows a
 * message and releases the control (Domain Rule 11).
 */

const { errorToast, reportError, updateProfileSettingsMock } = vi.hoisted(() => ({
  errorToast: vi.fn(),
  reportError: vi.fn(),
  updateProfileSettingsMock: vi.fn(),
}));

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

// The theme control belongs to the shell and needs its provider; it is not
// what this page's wiring is about.
vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => null,
}));

const { SettingsView } = await import("@/features/settings/components/settings-view");
const { ErrorBoundary } = await import("@/components/error-boundary");

beforeEach(() => {
  updateProfileSettingsMock.mockReset();
  errorToast.mockClear();
  reportError.mockClear();
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
    // The day reads as off the moment the button is pressed…
    expect(screen.getAllByText("Day off")).toHaveLength(3);

    // …and reads as it was once the server has refused.
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
    // The focus list is a different field with its own write; it stays live.
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

    // A zone the old four-entry list could not reach (Domain Rule 4: every
    // date boundary resolves in this setting).
    fireEvent.click(await screen.findByRole("option", { name: "Pacific/Auckland" }));

    await waitFor(() =>
      expect(updateProfileSettingsMock).toHaveBeenCalledWith({ timezone: "Pacific/Auckland" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Timezone" }).textContent).toContain(
        "Pacific/Auckland",
      ),
    );
    // The list closed and focus went back to the control, not to <body>.
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

describe("what the page does not offer", () => {
  it("has no notification switches, because nothing sends notifications yet", () => {
    render(<SettingsView defaults={DEFAULTS} />);

    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByText("Notifications")).toBeNull();
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
    // Genuinely focused, so the component's own `blur()` really dispatches —
    // which is the whole defect: it runs synchronously, before React has
    // re-rendered with the reset draft, so the blur handler still sees the
    // abandoned text and would send exactly the edit Escape threw away.
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

    // The flag is the blur handler's only escape hatch; a leaked one would
    // silently swallow every later commit on the field.
    field.focus();
    fireEvent.change(field, { target: { value: "D. Ross" } });
    fireEvent.blur(field);

    expect(updateProfileSettingsMock).toHaveBeenCalledWith({ displayName: "D. Ross" });
  });
});

/*
 * The other half of "on failure" (docs/ARCHITECTURE.md §8). The action reports
 * an expected failure by returning, but the call itself still rejects when the
 * device is offline, the response is a 5xx, the request is aborted or the
 * action id went stale in a deploy — and React re-throws a rejection out of the
 * transition at the next render, which would hand the boundary a blanked page
 * and leave this hook's pending key on a control with no write behind it.
 */
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

    // The server's own `unavailable` wording, so there is one message for
    // "could not reach the server" whichever side noticed.
    await waitFor(() =>
      expect(errorToast).toHaveBeenCalledWith(
        "Momentum could not reach the server. Your change was not saved.",
      ),
    );
    await waitFor(() => expect(screen.getAllByText("Day off")).toHaveLength(2));

    // The page is still there; the boundary never saw it.
    expect(screen.queryByRole("alert")).toBeNull();

    // The pending key is deleted on the caught path too, so the field is live
    // again rather than disabled forever with no write behind it.
    expect(screen.getByRole("button", { name: "Remove Monday window 1" })).toHaveProperty(
      "disabled",
      false,
    );

    // Swallowed for the user, not for us.
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});
