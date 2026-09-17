import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { localTime } from "@momentum/core/time";
import type { WorkingHours } from "@momentum/core/types";

import type { OnboardingChecklistProps } from "@/features/onboarding/components/onboarding-checklist";
import type { OnboardingState } from "@/features/onboarding/types";
import { QuickAddContext } from "@/features/tasks/components/quick-add-context";

const { actions, errorToast, reportError } = vi.hoisted(() => ({
  actions: {
    updateProfileSettings: vi.fn(),
    dismissOnboarding: vi.fn(),
  },
  errorToast: vi.fn(),
  reportError: vi.fn(),
}));

vi.mock("@/features/settings/actions", () => ({
  updateProfileSettings: (input: unknown) => actions.updateProfileSettings(input),
}));
vi.mock("@/features/onboarding/actions", () => ({
  dismissOnboarding: () => actions.dismissOnboarding(),
}));
vi.mock("@momentum/ui/components/toast", () => ({
  toast: { error: errorToast, success: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/report-error", () => ({ reportError }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));

const { OnboardingChecklist } =
  await import("@/features/onboarding/components/onboarding-checklist");

const OFFICE = { start: localTime("09:00"), end: localTime("17:00") };
const HOURS: WorkingHours = {
  0: [],
  1: [OFFICE],
  2: [OFFICE],
  3: [OFFICE],
  4: [OFFICE],
  5: [OFFICE],
  6: [],
};

function state(overrides: Partial<OnboardingState> = {}): OnboardingState {
  return { workingHoursSet: false, taskCount: 0, hasWorkBlock: false, ...overrides };
}

function renderChecklist(overrides: Partial<OnboardingChecklistProps> = {}) {
  const open = vi.fn();
  const props: OnboardingChecklistProps = {
    state: state(),
    workingHours: HOURS,
    weekStart: 1,
    liveHasWorkBlock: false,
    schedule: { label: "Find time", onActivate: vi.fn() },
    ...overrides,
  };
  const view = render(
    <QuickAddContext value={{ open, setDefaults: vi.fn() }}>
      <OnboardingChecklist {...props} />
    </QuickAddContext>,
  );
  return {
    open,
    props,
    rerender: (next: Partial<OnboardingChecklistProps>) =>
      view.rerender(
        <QuickAddContext value={{ open, setDefaults: vi.fn() }}>
          <OnboardingChecklist {...props} {...next} />
        </QuickAddContext>,
      ),
  };
}

function steps(): HTMLElement[] {
  return screen.getAllByRole("listitem").filter((row) => row.dataset.slot === "onboarding-step");
}

beforeEach(() => {
  actions.updateProfileSettings.mockReset().mockResolvedValue({ ok: true, data: {} });
  actions.dismissOnboarding.mockReset().mockResolvedValue({ ok: true, data: null });
  errorToast.mockClear();
  reportError.mockClear();
});

describe("the list", () => {
  it("names three steps, states progress, and marks the current one", () => {
    renderChecklist();

    const section = screen.getByRole("region", { name: "Set up your week" });
    expect(section.getAttribute("aria-describedby")).toBeTruthy();
    expect(within(section).getByText("0 of 3 done")).toBeDefined();

    const rows = steps();
    expect(rows.map((row) => row.dataset.state)).toEqual(["current", "upcoming", "upcoming"]);
    expect(rows[0]?.getAttribute("aria-current")).toBe("step");
    expect(rows[0]?.textContent).toContain("Current step");
    expect(rows[1]?.textContent).toContain("Not started");
  });

  it("derives each step from the data, in order, and words a done step", () => {
    renderChecklist({ state: state({ workingHoursSet: true, taskCount: 3 }) });

    const rows = steps();
    expect(rows.map((row) => row.dataset.state)).toEqual(["done", "done", "current"]);
    expect(rows[0]?.textContent).toContain("Done");
    expect(screen.getByText("2 of 3 done")).toBeDefined();
    expect(screen.getByRole("button", { name: "Find time" })).toBeDefined();
  });

  it("shows the hours summary in the user's week order before anything is edited", () => {
    renderChecklist();
    expect(screen.getByText("Mon–Fri 09:00–17:00")).toBeDefined();
    expect(screen.queryByRole("group", { name: "Working hours" })).toBeNull();
  });
});

describe("confirming hours", () => {
  it("saves the shown hours as they are, ticks the step, and opens Quick Add for an empty account", async () => {
    const { open } = renderChecklist();

    fireEvent.click(screen.getByRole("button", { name: "Use these hours" }));

    await waitFor(() => {
      expect(actions.updateProfileSettings).toHaveBeenCalledWith({ workingHours: HOURS });
    });
    await waitFor(() => expect(steps()[0]?.dataset.state).toBe("done"));
    expect(steps()[1]?.dataset.state).toBe("current");
    expect(open).toHaveBeenCalledWith({ placeholder: "e.g. Read chapter 4 by friday 90m" });
  });

  it("does not open Quick Add when tasks already exist", async () => {
    const { open } = renderChecklist({ state: state({ taskCount: 2 }) });

    fireEvent.click(screen.getByRole("button", { name: "Use these hours" }));

    await waitFor(() => expect(steps()[0]?.dataset.state).toBe("done"));
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByText("2 of 3 added")).toBeDefined();
  });

  it("reveals the editor on Adjust and saves the edited hours", async () => {
    renderChecklist();

    fireEvent.click(screen.getByRole("button", { name: "Adjust" }));
    const editor = screen.getByRole("group", { name: "Working hours" });
    fireEvent.click(within(editor).getByRole("button", { name: "Remove Friday window 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Save hours" }));

    await waitFor(() => {
      expect(actions.updateProfileSettings).toHaveBeenCalledWith({
        workingHours: { ...HOURS, 5: [] },
      });
    });
    await waitFor(() => expect(steps()[0]?.dataset.state).toBe("done"));
  });

  it("keeps the step open and says so when the save fails", async () => {
    actions.updateProfileSettings.mockResolvedValue({
      ok: false,
      error: { code: "unavailable", message: "Momentum could not save that change." },
    });
    renderChecklist();

    fireEvent.click(screen.getByRole("button", { name: "Use these hours" }));

    await waitFor(() =>
      expect(errorToast).toHaveBeenCalledWith("Momentum could not save that change."),
    );
    expect(steps()[0]?.dataset.state).toBe("current");
  });
});

describe("the last step", () => {
  it("opens Quick Add from the tasks step with the example placeholder", () => {
    const { open } = renderChecklist({ state: state({ workingHoursSet: true, taskCount: 1 }) });
    fireEvent.click(screen.getByRole("button", { name: "Add a task" }));
    expect(open).toHaveBeenCalledWith({ placeholder: "e.g. Read chapter 4 by friday 90m" });
  });

  it("ticks the moment a work block is on the board, and ends the checklist once", async () => {
    const { rerender } = renderChecklist({
      state: state({ workingHoursSet: true, taskCount: 3 }),
    });
    expect(actions.dismissOnboarding).not.toHaveBeenCalled();

    await act(async () => rerender({ liveHasWorkBlock: true }));

    expect(steps().map((row) => row.dataset.state)).toEqual(["done", "done", "done"]);
    expect(screen.getByText("3 of 3 done")).toBeDefined();
    expect(screen.getByText(/Your week has a plan/)).toBeDefined();
    expect(screen.queryByRole("button", { name: "Skip setup" })).toBeNull();
    await waitFor(() => expect(actions.dismissOnboarding).toHaveBeenCalledTimes(1));

    await act(async () =>
      rerender({
        liveHasWorkBlock: true,
        state: state({ workingHoursSet: true, taskCount: 4, hasWorkBlock: true }),
      }),
    );
    expect(actions.dismissOnboarding).toHaveBeenCalledTimes(1);
  });

  it("renders the schedule step without a button when there is nothing to place", () => {
    renderChecklist({ state: state({ workingHoursSet: true, taskCount: 3 }), schedule: null });
    expect(screen.queryByRole("button", { name: "Find time" })).toBeNull();
    expect(steps()[2]?.dataset.state).toBe("current");
  });
});

describe("skipping", () => {
  it("removes the list at once and records the skip", async () => {
    renderChecklist();

    fireEvent.click(screen.getByRole("button", { name: "Skip setup" }));

    expect(screen.queryByRole("region", { name: "Set up your week" })).toBeNull();
    await waitFor(() => expect(actions.dismissOnboarding).toHaveBeenCalledTimes(1));
  });

  it("brings the list back when the skip could not be saved", async () => {
    actions.dismissOnboarding.mockResolvedValue({
      ok: false,
      error: { code: "unavailable", message: "Momentum could not save that change." },
    });
    renderChecklist();

    fireEvent.click(screen.getByRole("button", { name: "Skip setup" }));

    await waitFor(() => expect(errorToast).toHaveBeenCalled());
    expect(screen.getByRole("region", { name: "Set up your week" })).toBeDefined();
  });
});
