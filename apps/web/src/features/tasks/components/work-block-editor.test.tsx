import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MIN_BLOCK_MINUTES } from "@momentum/core/calendar";
import { instant, localDate } from "@momentum/core/time";

import { WorkBlockEditor } from "@/features/tasks/components/work-block-editor";
import type { TaskWorkBlock } from "@/features/tasks/types";

const TODAY = localDate("2026-09-07");

function block(overrides: Partial<TaskWorkBlock> = {}): TaskWorkBlock {
  return {
    id: "b1",
    startAt: instant("2026-09-07T13:00:00.000Z"),
    endAt: instant("2026-09-07T14:00:00.000Z"),
    date: TODAY,
    startMinutes: 540,
    endMinutes: 600,
    minutes: 60,
    completedAt: null,
    ...overrides,
  };
}

function renderEditor({
  blocks = [] as readonly TaskWorkBlock[],
  defaultMinutes = 60,
  disabled = false,
  onAdd = vi.fn(),
}) {
  render(
    <WorkBlockEditor
      blocks={blocks}
      today={TODAY}
      weekStart={1}
      defaultMinutes={defaultMinutes}
      disabled={disabled}
      onAdd={onAdd}
      onUpdate={vi.fn()}
      onRemove={vi.fn()}
    />,
  );
  return onAdd;
}

const add = () => fireEvent.click(screen.getByRole("button", { name: "Add work block" }));

describe("adding a work block", () => {
  it("proposes the whole remaining estimate when the day has room for it", () => {
    const onAdd = renderEditor({ defaultMinutes: 90 });
    add();

    expect(onAdd).toHaveBeenCalledWith({ date: TODAY, startMinutes: 540, endMinutes: 630 });
  });

  it("bounds a remaining estimate larger than the day to the day it lands on", () => {
    // 40h of estimate: unclamped this proposes an end of 2940, past the 2880
    // `addWorkBlockInput` accepts.
    const onAdd = renderEditor({ defaultMinutes: 2400 });
    add();

    expect(onAdd).toHaveBeenCalledWith({ date: TODAY, startMinutes: 540, endMinutes: 1440 });
  });

  it("still proposes a usable block when the previous one starts late in the day", () => {
    const onAdd = renderEditor({
      blocks: [block({ startMinutes: 1430, endMinutes: 1440, minutes: 10 })],
      defaultMinutes: 2400,
    });
    add();

    // The floor wins over the ten minutes the day has left, so the span is
    // still longer than zero.
    expect(onAdd).toHaveBeenCalledWith({
      date: localDate("2026-09-08"),
      startMinutes: 1430,
      endMinutes: 1430 + MIN_BLOCK_MINUTES,
    });
  });
});

describe("while a write is in flight", () => {
  it("keeps the button focusable and inert, never natively disabled", () => {
    const onAdd = renderEditor({ disabled: true });
    const button = screen.getByRole("button", { name: "Add work block" });

    button.focus();
    expect(document.activeElement).toBe(button);
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(button.getAttribute("aria-disabled")).toBe("true");

    add();
    expect(onAdd).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
  });
});
