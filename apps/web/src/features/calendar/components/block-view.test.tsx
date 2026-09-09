import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_GRID_SPEC } from "@momentum/core/calendar";
import { ianaTimeZone, instant, localDate } from "@momentum/core/time";
import type { BlockKind } from "@momentum/core/types";

import { BlockView } from "@/features/calendar/components/block-view";
import type {
  CalendarCallbacks,
  CalendarItem,
  CalendarSettings,
  ItemSegment,
  WorkBlockContext,
} from "@/features/calendar/types";

const SETTINGS: CalendarSettings = {
  timezone: ianaTimeZone("UTC"),
  weekStart: 1,
  snapMinutes: 15,
  spec: DEFAULT_GRID_SPEC,
};

function makeCallbacks(): CalendarCallbacks {
  return {
    onCreateAt: vi.fn(),
    onOpenItem: vi.fn(),
    onToggleComplete: vi.fn(),
    onDelete: vi.fn(),
    onReschedule: vi.fn(),
    onScheduleTask: vi.fn(),
  };
}

function work(overrides: Partial<WorkBlockContext> = {}): WorkBlockContext {
  return {
    taskId: "task-1",
    taskTitle: "History essay",
    taskCompletedAt: null,
    taskDueDate: null,
    taskEstimatedMinutes: null,
    blockCount: 2,
    completesTask: false,
    ...overrides,
  };
}

function makeItem(overrides: Partial<CalendarItem> = {}): CalendarItem {
  const kind: BlockKind = overrides.kind ?? "work";
  return {
    id: "block-1",
    blockId: "block-1",
    kind,
    title: "History essay",
    description: null,
    startAt: instant("2026-09-08T09:00:00Z"),
    endAt: instant("2026-09-08T10:00:00Z"),
    allDay: false,
    ownColor: null,
    color: "blue",
    completedAt: null,
    occurrence: null,
    work: kind === "work" ? work() : null,
    habitId: null,
    habitRecordable: false,
    ...overrides,
  };
}

function makeSegment(item: CalendarItem, overrides: Partial<ItemSegment> = {}): ItemSegment {
  return {
    key: `${item.id}:2026-09-08`,
    item,
    date: localDate("2026-09-08"),
    startMinutes: 9 * 60,
    endMinutes: 10 * 60,
    isStart: true,
    isEnd: true,
    column: 0,
    columns: 1,
    ...overrides,
  };
}

function renderBlock(item: CalendarItem, overrides: Partial<ItemSegment> = {}, ghost = false) {
  const callbacks = makeCallbacks();
  const view = render(
    <BlockView
      segment={makeSegment(item, overrides)}
      settings={SETTINGS}
      callbacks={callbacks}
      ghost={ghost}
    />,
  );
  return { ...view, callbacks };
}

describe("BlockView", () => {
  it("offers to complete the task when this block is the last one outstanding", () => {
    renderBlock(makeItem({ work: work({ completesTask: true, blockCount: 1 }) }));
    expect(screen.getByRole("button", { name: "Complete task" })).toBeDefined();
  });

  it("offers to finish only this block when the task has others", () => {
    renderBlock(makeItem({ work: work({ completesTask: false }) }));
    expect(screen.getByRole("button", { name: "Done with this block" })).toBeDefined();
  });

  it("reports the completion to the board", () => {
    const item = makeItem();
    const { callbacks } = renderBlock(item);

    fireEvent.click(screen.getByRole("button", { name: "Done with this block" }));

    expect(callbacks.onToggleComplete).toHaveBeenCalledWith(item);
  });

  it("does not also open the block it was completed from", () => {
    const open = vi.fn();
    const callbacks = makeCallbacks();
    render(
      <div onClick={open}>
        <BlockView segment={makeSegment(makeItem())} settings={SETTINGS} callbacks={callbacks} />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Done with this block" }));

    expect(callbacks.onToggleComplete).toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it("marks a completed block as completed and offers to undo it", () => {
    renderBlock(makeItem({ completedAt: instant("2026-09-08T10:00:00Z") }));

    expect(screen.getByRole("button", { name: "Mark as not done" })).toBeDefined();
    expect(screen.getByText(/completed/)).toBeDefined();
  });

  it("renders a block of an already-completed task as settled, not as done", () => {
    renderBlock(makeItem({ work: work({ taskCompletedAt: instant("2026-09-07T18:00:00Z") }) }));

    expect(screen.getByText(/task completed/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Done with this block" })).toBeDefined();
  });

  it("gives an event no completion control", () => {
    renderBlock(makeItem({ kind: "event", title: "Lecture", work: null }));
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("gives a habit block a control on the days its completion can be recorded", () => {
    renderBlock(
      makeItem({
        id: "h",
        kind: "habit",
        title: "Run",
        work: null,
        habitId: "habit-1",
        habitRecordable: true,
      }),
    );
    expect(screen.getByRole("button", { name: "Mark habit done" })).toBeDefined();
  });

  it("offers no control on a habit block outside the recording window", () => {
    renderBlock(
      makeItem({
        id: "h",
        kind: "habit",
        title: "Run",
        work: null,
        habitId: "habit-1",
        habitRecordable: false,
      }),
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("still offers the undo on a completed habit block, whatever its date", () => {
    renderBlock(
      makeItem({
        id: "h",
        kind: "habit",
        title: "Run",
        work: null,
        habitId: "habit-1",
        habitRecordable: false,
        completedAt: instant("2026-09-08T10:00:00Z"),
      }),
    );
    expect(screen.getByRole("button", { name: "Mark as not done" })).toBeDefined();
  });

  it("carries no control on the drag ghost", () => {
    renderBlock(makeItem(), {}, true);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("carries no second control on the half of a block that crossed midnight", () => {
    renderBlock(makeItem(), { isStart: false, startMinutes: 0, endMinutes: 30 });
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/continued from the previous day/)).toBeDefined();
  });

  it("keeps the time range on a block too short to show it", () => {
    renderBlock(makeItem({ endAt: instant("2026-09-08T09:15:00Z") }), { endMinutes: 9 * 60 + 15 });
    expect(screen.getByText(/09:00 – 09:15/)).toBeDefined();
  });
});
