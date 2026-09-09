import * as React from "react";
import { DndContext } from "@dnd-kit/core";
import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GridSpec } from "@momentum/core/calendar";
import { ianaTimeZone, instant, localDate } from "@momentum/core/time";
import type { LocalDate } from "@momentum/core/types";
import { AnnouncerProvider } from "@momentum/ui/components/announcer";

import {
  BlockShell,
  CalendarInteractionProvider,
  DayColumn,
} from "@/features/calendar/components/interaction";
import type {
  CalendarCallbacks,
  CalendarItem,
  CalendarSettings,
  ItemSegment,
} from "@/features/calendar/types";
import { useCalendarDnd } from "@/features/calendar/use-calendar-dnd";

/**
 * The keyboard paths, which are the half of Domain Rule 10 that a regression
 * breaks silently: a pointer drag that stops working is noticed the first time
 * anyone opens the calendar, and `M` + arrows + Enter is not.
 *
 * These assert what the interaction reports — which callback ran and with which
 * span — rather than what it renders. The geometry behind each span is covered
 * directly in `use-calendar-dnd.test.ts`.
 */
const SPEC: GridSpec = {
  dayStartMinutes: 300,
  dayEndMinutes: 1440,
  hourHeightPx: 60,
  snapMinutes: 15,
};

const SETTINGS: CalendarSettings = {
  timezone: ianaTimeZone("America/New_York"),
  weekStart: 1,
  snapMinutes: 15,
  spec: SPEC,
};

const MON = localDate("2026-09-07");
const TUE = localDate("2026-09-08");
const DAYS: LocalDate[] = [MON, TUE];

function makeItem(overrides: Partial<CalendarItem> = {}): CalendarItem {
  return {
    id: "item-1",
    blockId: "block-1",
    kind: "work",
    title: "History essay",
    description: null,
    startAt: instant("2026-09-07T13:00:00.000Z"),
    endAt: instant("2026-09-07T14:00:00.000Z"),
    allDay: false,
    ownColor: null,
    color: "slate",
    completedAt: null,
    occurrence: null,
    work: {
      taskId: "task-1",
      taskTitle: "History essay",
      taskCompletedAt: null,
      taskDueDate: null,
      taskEstimatedMinutes: null,
      blockCount: 1,
      completesTask: true,
    },
    habitId: null,
    habitRecordable: false,
    ...overrides,
  };
}

function makeSegment(
  item: CalendarItem,
  date: LocalDate,
  start: number,
  end: number,
  overrides: Partial<ItemSegment> = {},
): ItemSegment {
  return {
    key: `${item.id}:${date}`,
    item,
    date,
    startMinutes: start,
    endMinutes: end,
    isStart: true,
    isEnd: true,
    column: 0,
    columns: 1,
    ...overrides,
  };
}

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

function Board({
  segments,
  callbacks,
}: {
  segments: readonly ItemSegment[];
  callbacks: CalendarCallbacks;
}) {
  const items = segments.map((segment) => segment.item);
  const controller = useCalendarDnd({ settings: SETTINGS, callbacks, items });

  return (
    <DndContext
      sensors={controller.sensors}
      collisionDetection={controller.collisionDetection}
      accessibility={controller.accessibility}
      onDragStart={controller.onDragStart}
      onDragMove={controller.onDragMove}
      onDragEnd={controller.onDragEnd}
      onDragCancel={controller.onDragCancel}
    >
      <CalendarInteractionProvider controller={controller}>
        {DAYS.map((date, index) => (
          <DayColumn
            key={date}
            date={date}
            settings={SETTINGS}
            isToday={index === 0}
            callbacks={callbacks}
            tabIndex={index === 0 ? 0 : -1}
          >
            {segments
              .filter((segment) => segment.date === date)
              .map((segment) => (
                <BlockShell
                  key={segment.key}
                  segment={segment}
                  settings={SETTINGS}
                  callbacks={callbacks}
                  style={{}}
                  label={`${segment.item.title}, work block`}
                >
                  <span>{segment.item.title}</span>
                </BlockShell>
              ))}
          </DayColumn>
        ))}
      </CalendarInteractionProvider>
    </DndContext>
  );
}

function setup(segments: readonly ItemSegment[] = [makeSegment(makeItem(), MON, 540, 600)]) {
  const callbacks = makeCallbacks();
  const view = render(
    <AnnouncerProvider>
      <Board segments={segments} callbacks={callbacks} />
    </AnnouncerProvider>,
  );

  const columns = [...view.container.querySelectorAll<HTMLElement>('[data-slot="day-column"]')];
  const blocks = [...view.container.querySelectorAll<HTMLElement>('[data-slot="block-shell"]')];
  return { callbacks, columns, blocks, view };
}

/**
 * Focus first, then the key: every handler here guards on the event's target,
 * because a key pressed on a block inside a column belongs to the block.
 */
function press(element: HTMLElement, key: string, options: { shiftKey?: boolean } = {}) {
  act(() => element.focus());
  fireEvent.keyDown(element, { key, ...options });
}

describe("keyboard move mode", () => {
  it("commits a move of one increment on Enter", () => {
    const { callbacks, blocks } = setup();
    const block = blocks[0]!;

    press(block, "m");
    press(block, "ArrowDown");
    press(block, "Enter");

    expect(callbacks.onReschedule).toHaveBeenCalledTimes(1);
    expect(callbacks.onReschedule).toHaveBeenCalledWith(
      expect.objectContaining({ id: "item-1" }),
      { date: MON, startMinutes: 555, endMinutes: 615 },
      expect.any(String),
    );
  });

  it("hands the result sentence to the board instead of announcing it before the write lands", () => {
    // Announced on the keystroke, "Moved …" would stand uncorrected when the
    // write failed and the block rolled back (Domain Rule 11). The board says
    // it once the server has agreed, so the sentence travels with the callback.
    const { callbacks, blocks, view } = setup();
    const block = blocks[0]!;

    press(block, "m");
    press(block, "ArrowDown");
    press(block, "Enter");

    expect(callbacks.onReschedule).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "Moved History essay to Mon Sep 7, 09:15 – 10:15.",
    );
    const spoken = [...view.container.querySelectorAll("[aria-live]")]
      .map((region) => region.textContent)
      .join(" ");
    expect(spoken).not.toContain("Moved");
  });

  it("moves by an hour with Shift and by a day with Left and Right", () => {
    const { callbacks, blocks } = setup();
    const block = blocks[0]!;

    press(block, "m");
    press(block, "ArrowDown", { shiftKey: true });
    press(block, "ArrowRight");
    press(block, "Enter");

    expect(callbacks.onReschedule).toHaveBeenCalledWith(
      expect.anything(),
      { date: TUE, startMinutes: 600, endMinutes: 660 },
      expect.any(String),
    );
  });

  it("writes nothing when the mode is cancelled with Escape", () => {
    const { callbacks, blocks } = setup();
    const block = blocks[0]!;

    press(block, "m");
    expect(block.getAttribute("aria-pressed")).toBe("true");

    press(block, "ArrowDown");
    press(block, "Escape");

    expect(callbacks.onReschedule).not.toHaveBeenCalled();
    expect(block.hasAttribute("aria-pressed")).toBe(false);

    // The block is back to its idle keys: Enter opens it rather than committing.
    press(block, "Enter");
    expect(callbacks.onOpenItem).toHaveBeenCalledTimes(1);
  });

  it("does not persist a move that ended where it started", () => {
    const { callbacks, blocks } = setup();
    const block = blocks[0]!;

    press(block, "m");
    press(block, "ArrowDown");
    press(block, "ArrowUp");
    press(block, "Enter");

    expect(callbacks.onReschedule).not.toHaveBeenCalled();
  });
});

describe("keyboard resize mode", () => {
  it("adjusts the end with the arrows", () => {
    const { callbacks, blocks } = setup();
    const block = blocks[0]!;

    press(block, "r");
    press(block, "ArrowDown");
    press(block, "Enter");

    expect(callbacks.onReschedule).toHaveBeenCalledWith(
      expect.anything(),
      { date: MON, startMinutes: 540, endMinutes: 615 },
      "History essay is now Mon Sep 7, 09:00 – 10:15, 1h 15m.",
    );
  });

  it("adjusts the start with Shift and the arrows", () => {
    const { callbacks, blocks } = setup();
    const block = blocks[0]!;

    press(block, "r");
    press(block, "ArrowDown", { shiftKey: true });
    press(block, "Enter");

    expect(callbacks.onReschedule).toHaveBeenCalledWith(
      expect.anything(),
      { date: MON, startMinutes: 555, endMinutes: 600 },
      expect.any(String),
    );
  });

  it("holds the minimum duration rather than inverting the block", () => {
    const { callbacks, blocks } = setup();
    const block = blocks[0]!;

    press(block, "r");
    for (let index = 0; index < 8; index += 1) press(block, "ArrowUp");
    press(block, "Enter");

    expect(callbacks.onReschedule).toHaveBeenCalledWith(
      expect.anything(),
      { date: MON, startMinutes: 540, endMinutes: 555 },
      expect.any(String),
    );
  });
});

/**
 * A moved block is a different element: its React key carries the day, so a
 * move to another day unmounts one `BlockShell` and mounts another, and a
 * deleted block is simply gone. Either way the keyboard user who pressed Enter
 * has to land on something real — the block under its new key, or a neighbour
 * — never on `<body>`, where the next `M` does nothing (Domain Rule 10).
 */
describe("focus after the focused block leaves the grid", () => {
  /** The board, minimally: it applies the reschedule or delete it is told about. */
  function LiveBoard({
    initial,
    callbacks,
  }: {
    initial: readonly ItemSegment[];
    callbacks: CalendarCallbacks;
  }) {
    const [segments, setSegments] = React.useState(initial);
    const live: CalendarCallbacks = {
      ...callbacks,
      onReschedule: (item, span, announcement) => {
        callbacks.onReschedule(item, span, announcement);
        setSegments((current) =>
          current.map((segment) =>
            segment.item.id === item.id
              ? makeSegment(segment.item, span.date, span.startMinutes, span.endMinutes)
              : segment,
          ),
        );
      },
      onDelete: (item) => {
        callbacks.onDelete(item);
        setSegments((current) => current.filter((segment) => segment.item.id !== item.id));
      },
    };
    return <Board segments={segments} callbacks={live} />;
  }

  function setupLive(initial: readonly ItemSegment[]) {
    const callbacks = makeCallbacks();
    const view = render(
      <AnnouncerProvider>
        <LiveBoard initial={initial} callbacks={callbacks} />
      </AnnouncerProvider>,
    );
    const shells = () => [
      ...view.container.querySelectorAll<HTMLElement>('[data-slot="block-shell"]'),
    ];
    return { view, shells };
  }

  it("follows a block moved to another day onto its new element", () => {
    const { shells } = setupLive([makeSegment(makeItem(), MON, 540, 600)]);
    const before = shells()[0]!;

    press(before, "m");
    press(before, "ArrowRight");
    press(before, "Enter");

    const after = shells()[0]!;
    expect(after).not.toBe(before);
    expect(after.closest('[data-slot="day-column"]')?.getAttribute("aria-label")).toContain(
      "September 8",
    );
    expect(document.activeElement).toBe(after);
    expect(document.activeElement).not.toBe(document.body);
  });

  it("lands on a neighbouring block when the focused block is deleted", async () => {
    const { shells } = setupLive([
      makeSegment(makeItem({ id: "item-1" }), MON, 540, 600),
      makeSegment(makeItem({ id: "item-2", title: "Reading" }), MON, 660, 720),
    ]);
    const [first, second] = shells();

    press(first!, "Delete");
    // The hand-off waits a tick for anything remounting under the same item.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(shells()).toEqual([second]);
    expect(document.activeElement).toBe(second);
  });

  it("lands on the day column when the deleted block was the only one", async () => {
    const { shells, view } = setupLive([makeSegment(makeItem(), MON, 540, 600)]);

    press(shells()[0]!, "Delete");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(shells()).toHaveLength(0);
    const column = view.container.querySelector<HTMLElement>('[data-slot="day-column"]');
    expect(document.activeElement).toBe(column);
  });
});

describe("touch", () => {
  it("leaves scrolling to the browser until a press-and-hold picks the block up", () => {
    // `touch-action: none` would make every block a dead zone for scrolling
    // the grid on a phone; `auto` lets the browser claim a drag. The block
    // opts out of double-tap zoom only, and the touch sensor's hold does the
    // rest.
    const { blocks } = setup();
    expect(blocks[0]!.className).toContain("touch-manipulation");
    expect(blocks[0]!.className).not.toContain("touch-none");
  });
});

describe("block keys outside a mode", () => {
  it("opens on Enter, toggles completion on Space and deletes on Delete", () => {
    const { callbacks, blocks } = setup();
    const block = blocks[0]!;

    press(block, "Enter");
    press(block, " ");
    press(block, "Delete");

    expect(callbacks.onOpenItem).toHaveBeenCalledTimes(1);
    expect(callbacks.onToggleComplete).toHaveBeenCalledTimes(1);
    expect(callbacks.onDelete).toHaveBeenCalledTimes(1);
  });

  it("leaves Space alone on an event, which has no completion state", () => {
    const event = makeItem({ id: "item-2", kind: "event", work: null, title: "AP Chem" });
    const { callbacks, blocks } = setup([makeSegment(event, MON, 540, 600)]);

    press(blocks[0]!, " ");
    expect(callbacks.onToggleComplete).not.toHaveBeenCalled();
  });
});

/**
 * What a block says it can do has to be what it does. A description that offers
 * a key the element ignores is the mirror image of an undiscoverable keyboard
 * model: the user presses it and gets silence, with nothing to tell them why
 * (docs/DESIGN_SYSTEM.md's accessibility floor, Domain Rule 10).
 */
describe("a block's accessible description", () => {
  /** The text a screen reader would read after the block's name. */
  function description(block: HTMLElement): string {
    return (block.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ");
  }

  it("offers the move and resize keys on a block that has them", () => {
    const { blocks } = setup();
    const text = description(blocks[0]!);

    expect(text).toContain("M to move");
    expect(text).toContain("R to resize");
    expect(text).toContain("Space to complete");
    // dnd-kit's own drag instructions are merged rather than replaced.
    expect(text).toContain("press M and use the arrow keys");
  });

  it("offers neither on a clipped half of a midnight-crossing block", () => {
    // `M` and `R` return without doing anything when a segment is only part of
    // its block, and dragging is disabled — so the description says so instead
    // of promising both twice.
    const clipped = makeSegment(makeItem(), MON, 1410, 1440, { isEnd: false });
    const { blocks } = setup([clipped]);
    const text = description(blocks[0]!);

    expect(text).not.toContain("to move");
    expect(text).not.toContain("to resize");
    expect(text).toContain("crosses midnight");
    // Nor is it announced as a draggable, which dnd-kit sets even when disabled.
    expect(blocks[0]!.getAttribute("aria-roledescription")).toBeNull();
  });

  it("does not offer Space on an event, which has no completion to toggle", () => {
    const event = makeItem({ id: "item-2", kind: "event", work: null, title: "AP Chem" });
    const { blocks } = setup([makeSegment(event, MON, 540, 600)]);

    const text = description(blocks[0]!);
    expect(text).not.toContain("Space");
    expect(text).toContain("Enter to open");
  });
});

describe("roving focus", () => {
  it("gives the whole week one block tab stop and moves between blocks with the arrows", () => {
    const first = makeSegment(makeItem({ id: "item-1" }), MON, 540, 600);
    const second = makeSegment(makeItem({ id: "item-2", title: "Reading" }), MON, 660, 720);
    const { blocks } = setup([first, second]);

    expect(blocks.filter((block) => block.tabIndex === 0)).toHaveLength(1);

    press(blocks[0]!, "ArrowDown");
    expect(document.activeElement).toBe(blocks[1]);
  });

  it("gives the columns one tab stop as well", () => {
    const { columns } = setup();
    expect(columns.filter((column) => column.tabIndex === 0)).toHaveLength(1);
  });
});

describe("the grid cursor", () => {
  it("creates a default-length block at the cursor on Enter", () => {
    const { callbacks, columns } = setup([]);
    const column = columns[0]!;

    press(column, "ArrowDown");
    press(column, "Enter");

    expect(callbacks.onCreateAt).toHaveBeenCalledWith({
      date: MON,
      startMinutes: 555,
      endMinutes: 585,
    });
  });

  it("extends the selection with Shift and creates the whole span", () => {
    const { callbacks, columns } = setup([]);
    const column = columns[0]!;

    press(column, "ArrowDown", { shiftKey: true });
    press(column, "ArrowDown", { shiftKey: true });
    press(column, "Enter");

    expect(callbacks.onCreateAt).toHaveBeenCalledWith({
      date: MON,
      startMinutes: 540,
      endMinutes: 600,
    });
  });

  it("carries the cursor to the next column and creates there", () => {
    const { callbacks, columns } = setup([]);

    press(columns[0]!, "ArrowRight");
    expect(document.activeElement).toBe(columns[1]);

    press(columns[1]!, "Enter");
    expect(callbacks.onCreateAt).toHaveBeenCalledWith(
      expect.objectContaining({ date: TUE, startMinutes: 540 }),
    );
  });

  it("stops at the edge of the displayed range instead of leaving the grid", () => {
    const { callbacks, columns } = setup([]);

    press(columns[0]!, "ArrowLeft");
    press(columns[0]!, "Enter");

    expect(callbacks.onCreateAt).toHaveBeenCalledWith(
      expect.objectContaining({ date: MON, startMinutes: 540 }),
    );
  });
});

/**
 * The tab order is the whole of Domain Rule 10's "reachable": a grid with no
 * tab stop has a complete keyboard model that nobody can start. It is also the
 * thing a plain re-render breaks silently, because every block still looks and
 * behaves correctly once something focuses it.
 */
describe("the roving tab order", () => {
  function tabStops(elements: readonly HTMLElement[]): number {
    return elements.filter((element) => element.tabIndex === 0).length;
  }

  it("gives each group exactly one tab stop on arrival", () => {
    const { columns, blocks } = setup([
      makeSegment(makeItem({ id: "a" }), MON, 540, 600),
      makeSegment(makeItem({ id: "b" }), MON, 660, 720),
      makeSegment(makeItem({ id: "c" }), TUE, 540, 600),
    ]);

    expect(tabStops(blocks)).toBe(1);
    expect(tabStops(columns)).toBe(1);
  });

  it("keeps a block tab stop when the block holding it unmounts", async () => {
    // Deleting a block unmounts the element that held the stop. Releasing it
    // is not enough on its own: `register` runs on mount and every surviving
    // block is already mounted, so nothing re-claims and the whole week leaves
    // the tab order — every block unreachable by keyboard until the route
    // remounts. Promoting a survivor inside the cleanup is not enough either,
    // because a commit can unmount several and the survivor picked first may
    // be gone by the last.
    const segments = [
      makeSegment(makeItem({ id: "a" }), MON, 540, 600),
      makeSegment(makeItem({ id: "b" }), MON, 660, 720),
    ];
    const callbacks = makeCallbacks();

    function Shrinking() {
      const [visible, setVisible] = React.useState(segments);
      return (
        <>
          <button type="button" onClick={() => setVisible(segments.slice(1))}>
            drop the first
          </button>
          <Board segments={visible} callbacks={callbacks} />
        </>
      );
    }

    const view = render(
      <AnnouncerProvider>
        <Shrinking />
      </AnnouncerProvider>,
    );
    const shells = () => [
      ...view.container.querySelectorAll<HTMLElement>('[data-slot="block-shell"]'),
    ];

    expect(tabStops(shells())).toBe(1);

    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "drop the first" }));
      // The repair runs on a microtask, after every cleanup and every
      // re-registration of the commit has settled.
      await Promise.resolve();
    });

    expect(shells()).toHaveLength(1);
    expect(tabStops(shells())).toBe(1);
  });
});
