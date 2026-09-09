import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_GRID_SPEC } from "@momentum/core/calendar";
import { ianaTimeZone, localDate } from "@momentum/core/time";
import type { LocalDate } from "@momentum/core/types";

import type { CalendarSettings, PlanTask } from "@/features/calendar/types";
import {
  ScheduleTaskDialog,
  type ScheduleTaskDialogProps,
} from "@/features/planning/components/schedule-task-dialog";

const DAYS: readonly LocalDate[] = [
  "2026-09-07",
  "2026-09-08",
  "2026-09-09",
  "2026-09-10",
  "2026-09-11",
  "2026-09-12",
  "2026-09-13",
].map(localDate);

const TODAY = localDate("2026-09-08");

const SETTINGS: CalendarSettings = {
  timezone: ianaTimeZone("America/New_York"),
  weekStart: 1,
  snapMinutes: 15,
  spec: DEFAULT_GRID_SPEC,
};

const HOMEWORK: PlanTask = {
  id: "task-homework",
  title: "Finish statistics homework",
  priority: 4,
  estimatedMinutes: 45,
  dueDate: null,
  projectName: null,
  projectColor: null,
  scheduledOutsideMinutes: 0,
};

function renderDialog(overrides: Partial<ScheduleTaskDialogProps> = {}) {
  const props: ScheduleTaskDialogProps = {
    task: HOMEWORK,
    settings: SETTINGS,
    days: DAYS,
    today: TODAY,
    onSchedule: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<ScheduleTaskDialog {...props} />);
  return props;
}

describe("ScheduleTaskDialog", () => {
  it("schedules a block as long as the estimate, on today at 09:00 by default", () => {
    const { onSchedule, onClose } = renderDialog();

    expect(screen.getByRole("dialog", { name: "Schedule task" })).toBeDefined();
    expect(screen.getByText("Finish statistics homework")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));

    expect(onSchedule).toHaveBeenCalledWith("task-homework", {
      date: "2026-09-08",
      startMinutes: 540,
      endMinutes: 585,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("falls back to a block of the shared default length for a task with no estimate", () => {
    const { onSchedule } = renderDialog({ task: { ...HOMEWORK, estimatedMinutes: null } });

    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));

    expect(onSchedule).toHaveBeenCalledWith("task-homework", {
      date: "2026-09-08",
      startMinutes: 540,
      endMinutes: 570,
    });
  });

  it("defaults to the first displayed day when today is outside the range", () => {
    const { onSchedule } = renderDialog({ today: localDate("2026-09-20") });

    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));

    expect(onSchedule).toHaveBeenCalledWith(
      "task-homework",
      expect.objectContaining({ date: "2026-09-07" }),
    );
  });

  it("keeps the chosen date, start time and duration", () => {
    const { onSchedule } = renderDialog();

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-09-10" } });
    fireEvent.change(screen.getByLabelText("Start"), { target: { value: "16:00" } });
    fireEvent.change(screen.getByLabelText("Duration (minutes)"), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));

    expect(onSchedule).toHaveBeenCalledWith("task-homework", {
      date: "2026-09-10",
      startMinutes: 960,
      endMinutes: 1050,
    });
  });

  it("refuses a block that would run past midnight, and says so", () => {
    const { onSchedule } = renderDialog();

    fireEvent.change(screen.getByLabelText("Start"), { target: { value: "23:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));

    expect(onSchedule).not.toHaveBeenCalled();
    expect(screen.getByText(/run past midnight/)).toBeDefined();
    expect(screen.getByLabelText("Duration (minutes)").getAttribute("aria-invalid")).toBe("true");
  });

  it("refuses a block shorter than the minimum", () => {
    const { onSchedule } = renderDialog();

    fireEvent.change(screen.getByLabelText("Duration (minutes)"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));

    expect(onSchedule).not.toHaveBeenCalled();
    expect(screen.getByText(/A block is at least/)).toBeDefined();
  });

  it("closes on Escape and on Cancel without scheduling", () => {
    const { onSchedule, onClose } = renderDialog();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onSchedule).not.toHaveBeenCalled();
  });

  it("focuses the date field on open", async () => {
    renderDialog();

    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Date")));
  });
});
