import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MIN_BLOCK_MINUTES } from "@momentum/core/calendar";
import { instant, localDate } from "@momentum/core/time";

import { WorkBlockEditor } from "@/features/tasks/components/work-block-editor";
import type { TaskWorkBlock } from "@/features/tasks/types";

/**
 * "Add work block" proposes a span, and the span it proposes has to be one the
 * action will accept. `addWorkBlockInput` caps a block's end at 2880 minutes
 * past its own midnight, so a proposal built from an unbounded remaining
 * estimate is rejected — and because a rejected add never shrinks the
 * remainder, the button would fail identically on every click. The clamp is the
 * same one `clampSpan` applies to every block a drag on the grid creates.
 */

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
    // 40h of estimate. Unclamped this proposes an end of 2940, past the 2880 the
    // action accepts, and the button becomes a permanent dead end on that task.
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
    // still longer than zero — an inverted or empty span fails the schema's own
    // "a block has to end after it starts".
    expect(onAdd).toHaveBeenCalledWith({
      date: localDate("2026-09-08"),
      startMinutes: 1430,
      endMinutes: 1430 + MIN_BLOCK_MINUTES,
    });
  });
});

/**
 * "Add work block" raises the sheet's in-flight flag by being pressed. A
 * natively disabled button is blurred by the browser, so the keyboard user who
 * just added a block would land on `<body>`; the button stays focusable and
 * the guard in its handler is what makes it inert (Domain Rule 10).
 */
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
