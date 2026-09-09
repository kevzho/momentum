import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { localDate } from "@momentum/core/time";

import type { PlanTask } from "@/features/calendar/types";
import {
  PlanningTaskRow,
  type PlanningTaskRowProps,
} from "@/features/planning/components/planning-task-row";

function planTask(overrides: Partial<PlanTask> & Pick<PlanTask, "id" | "title">): PlanTask {
  return {
    priority: 4,
    estimatedMinutes: null,
    dueDate: null,
    projectName: null,
    projectColor: null,
    scheduledOutsideMinutes: 0,
    ...overrides,
  };
}

const ESSAY = planTask({
  id: "task-essay",
  title: "History essay",
  priority: 2,
  estimatedMinutes: 120,
  dueDate: localDate("2026-09-11"),
  projectName: "History 210",
  projectColor: "amber",
});

function renderRow(overrides: Partial<PlanningTaskRowProps> = {}) {
  const props: PlanningTaskRowProps = {
    task: ESSAY,
    scheduledMinutes: 30,
    pending: false,
    onFindTime: vi.fn(),
    onSchedule: vi.fn(),
    ...overrides,
  };
  render(
    <ul>
      <PlanningTaskRow {...props} />
    </ul>,
  );
  return { ...props, row: screen.getByRole("button") };
}

describe("PlanningTaskRow", () => {
  it("shows the estimate, the project, the due date and the live coverage", () => {
    const { row } = renderRow();

    expect(within(row).getByText("History essay")).toBeDefined();
    expect(within(row).getByText("2h")).toBeDefined();
    expect(within(row).getByText("History 210")).toBeDefined();
    expect(within(row).getByText("Due Sep 11")).toBeDefined();
    expect(within(row).getByText("30m of 2h scheduled")).toBeDefined();
  });

  it("reads to a screen reader as one composed name", () => {
    const { row } = renderRow();

    expect(row.getAttribute("aria-label")).toBe(
      "History essay, Priority 2, History 210, 2h estimated, due Sep 11, 2026, 30m of 2h scheduled",
    );
  });

  it("carries a priority glyph for P1–P3, named in the row's label", () => {
    const { row } = renderRow();

    expect(row.querySelector("svg")).not.toBeNull();
    expect(row.getAttribute("aria-label")).toContain("Priority 2");
  });

  it("renders nothing for P4 — no priority set is not a low priority", () => {
    const { row } = renderRow({
      task: planTask({ id: "t2", title: "Read chapter 4", priority: 4 }),
      scheduledMinutes: 0,
    });

    expect(row.querySelector("svg")).toBeNull();
    expect(row.getAttribute("aria-label")).toBe("Read chapter 4, no estimate");
  });

  it("opens Find Time on activation and on F", () => {
    const { row, onFindTime, onSchedule } = renderRow();

    fireEvent.click(row);
    expect(onFindTime).toHaveBeenCalledTimes(1);
    expect(onFindTime).toHaveBeenLastCalledWith(ESSAY);

    fireEvent.keyDown(row, { key: "f" });
    fireEvent.keyDown(row, { key: "F" });
    expect(onFindTime).toHaveBeenCalledTimes(3);
    expect(onSchedule).not.toHaveBeenCalled();
  });

  it("opens the manual dialog on S", () => {
    const { row, onFindTime, onSchedule } = renderRow();

    fireEvent.keyDown(row, { key: "s" });
    fireEvent.keyDown(row, { key: "S" });
    expect(onSchedule).toHaveBeenCalledTimes(2);
    expect(onSchedule).toHaveBeenLastCalledWith(ESSAY);
    expect(onFindTime).not.toHaveBeenCalled();
  });

  it("leaves modified keys to the browser", () => {
    const { row, onFindTime, onSchedule } = renderRow();

    fireEvent.keyDown(row, { key: "f", metaKey: true });
    fireEvent.keyDown(row, { key: "f", ctrlKey: true });
    fireEvent.keyDown(row, { key: "s", altKey: true });
    expect(onFindTime).not.toHaveBeenCalled();
    expect(onSchedule).not.toHaveBeenCalled();
  });

  it("reads as settled while its schedule is in flight, and opens nothing", () => {
    const { row, onFindTime, onSchedule } = renderRow({ pending: true });

    expect(row.getAttribute("aria-disabled")).toBe("true");
    expect(row.getAttribute("data-pending")).toBe("true");
    expect(row.tabIndex).toBe(0);

    fireEvent.click(row);
    fireEvent.keyDown(row, { key: "f" });
    fireEvent.keyDown(row, { key: "s" });
    expect(onFindTime).not.toHaveBeenCalled();
    expect(onSchedule).not.toHaveBeenCalled();
  });

  it("is a dnd-kit draggable", () => {
    const { row } = renderRow();
    expect(row.getAttribute("aria-roledescription")).toBe("draggable");
  });
});
