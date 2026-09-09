import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_GRID_SPEC } from "@momentum/core/calendar";
import { ianaTimeZone, instant, localDate } from "@momentum/core/time";

import { BlockEditor } from "@/features/calendar/components/block-editor";
import type {
  BlockDraft,
  BlockEditorProps,
  CalendarItem,
  CalendarSettings,
  DaySpan,
  WorkBlockContext,
} from "@/features/calendar/types";

const SETTINGS: CalendarSettings = {
  timezone: ianaTimeZone("America/New_York"),
  weekStart: 1,
  snapMinutes: 15,
  spec: DEFAULT_GRID_SPEC,
};

const SPAN: DaySpan = {
  date: localDate("2026-09-08"),
  startMinutes: 16 * 60,
  endMinutes: 16 * 60 + 45,
};

const CREATE_DRAFT: BlockDraft = { mode: "create", span: SPAN };

// 23:30 to 00:30, counted from the day the block starts on, as `spanOf` returns it.
const CROSSING_SPAN: DaySpan = {
  date: localDate("2026-09-08"),
  startMinutes: 23 * 60 + 30,
  endMinutes: 24 * 60 + 30,
};

const WORK: WorkBlockContext = {
  taskId: "task-1",
  taskTitle: "History essay",
  taskCompletedAt: null,
  taskDueDate: null,
  taskEstimatedMinutes: null,
  blockCount: 3,
  completesTask: false,
};

function workItem(overrides: Partial<CalendarItem> = {}): CalendarItem {
  return {
    id: "block-1",
    blockId: "block-1",
    kind: "work",
    title: "History essay",
    description: null,
    startAt: instant("2026-09-08T20:00:00.000Z"),
    endAt: instant("2026-09-08T20:45:00.000Z"),
    allDay: false,
    ownColor: null,
    color: "amber",
    completedAt: null,
    occurrence: null,
    work: WORK,
    habitId: null,
    habitRecordable: false,
    ...overrides,
  };
}

function renderEditor(overrides: Partial<BlockEditorProps> = {}) {
  const props: BlockEditorProps = {
    draft: CREATE_DRAFT,
    settings: SETTINGS,
    onClose: vi.fn(),
    onSubmit: vi.fn(),
    onDelete: vi.fn(),
    onToggleComplete: vi.fn(),
    pending: false,
    ...overrides,
  };
  render(<BlockEditor {...props} />);
  return props;
}

describe("BlockEditor", () => {
  it("prefills a create draft with the date and time that was selected", () => {
    renderEditor();

    expect(screen.getByLabelText<HTMLInputElement>("Date").value).toBe("2026-09-08");
    expect(screen.getByLabelText<HTMLInputElement>("Start").value).toBe("16:00");
    expect(screen.getByLabelText<HTMLInputElement>("End").value).toBe("16:45");
    expect(document.activeElement).toBe(screen.getByLabelText("Title"));
  });

  it("reads an end at or before the start as the next day's, and says so", () => {
    const { onSubmit } = renderEditor();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Study group" } });
    fireEvent.change(screen.getByLabelText("Start"), { target: { value: "23:30" } });
    fireEvent.change(screen.getByLabelText("End"), { target: { value: "00:30" } });

    expect(screen.getByText(/23:30 – 00:30 next day · 1h/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ startMinutes: 1410, endMinutes: 1470 }),
    );
  });

  it("brings an end back onto the same day once the start moves before it", () => {
    const { onSubmit } = renderEditor();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Study group" } });
    fireEvent.change(screen.getByLabelText("End"), { target: { value: "15:00" } });
    expect(screen.getByText(/next day/)).toBeDefined();
    fireEvent.change(screen.getByLabelText("Start"), { target: { value: "14:00" } });
    expect(screen.queryByText(/next day/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ startMinutes: 840, endMinutes: 900 }),
    );
  });

  it("refuses a block with no title", () => {
    const { onSubmit } = renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Give the block a title.")).toBeDefined();
  });

  it("emits the edited values on save", () => {
    const { onSubmit } = renderEditor();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "  Study group  " } });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Library, 2nd floor" },
    });
    fireEvent.change(screen.getByLabelText("End"), { target: { value: "17:30" } });
    fireEvent.click(screen.getByRole("radio", { name: "Amber" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledWith(CREATE_DRAFT, {
      title: "Study group",
      description: "Library, 2nd floor",
      date: "2026-09-08",
      startMinutes: 960,
      endMinutes: 1050,
      color: "amber",
    });
  });

  it("keeps a work block's title on its task, and shows the task it belongs to", () => {
    const item = workItem();
    renderEditor({ draft: { mode: "edit", item, span: SPAN } });

    expect(screen.queryByLabelText("Title")).toBeNull();
    expect(screen.getByText("Task")).toBeDefined();
    expect(screen.getByText("History essay")).toBeDefined();
  });

  it("names the parent a habit block or an occurrence takes its title from", () => {
    const habit = workItem({ kind: "habit", title: "Gym", work: null, habitId: "habit-1" });
    const { unmount } = render(
      <BlockEditor
        draft={{ mode: "edit", item: habit, span: SPAN }}
        settings={SETTINGS}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onDelete={vi.fn()}
        onToggleComplete={vi.fn()}
        pending={false}
      />,
    );
    expect(screen.getByText("Habit")).toBeDefined();
    expect(screen.getByText("Gym")).toBeDefined();
    expect(screen.queryByText("Task")).toBeNull();
    expect(screen.queryByText(/takes its title from its task/)).toBeNull();
    unmount();

    const occurrence = workItem({
      kind: "event",
      title: "Statistics lecture",
      work: null,
      occurrence: { seriesId: "series-1", occurrenceDate: localDate("2026-09-16") },
    });
    renderEditor({ draft: { mode: "edit", item: occurrence, span: SPAN } });
    // Once as the sheet's title, once as the read-only line's label.
    expect(screen.getAllByText("Event")).toHaveLength(2);
    expect(screen.getByText("Statistics lecture")).toBeDefined();
  });

  it("offers an occurrence only its times, so nothing typed can be discarded", () => {
    const occurrence = workItem({
      kind: "event",
      title: "Statistics lecture",
      description: "Room 204",
      work: null,
      occurrence: { seriesId: "series-1", occurrenceDate: localDate("2026-09-16") },
    });
    const { onSubmit } = renderEditor({ draft: { mode: "edit", item: occurrence, span: SPAN } });

    expect(screen.queryByLabelText("Description")).toBeNull();
    expect(screen.queryByRole("radio", { name: "Amber" })).toBeNull();
    expect(screen.getByText("Room 204")).toBeDefined();
    expect(screen.getByLabelText("Start")).toBeDefined();
    expect(screen.getByLabelText("End")).toBeDefined();

    fireEvent.change(screen.getByLabelText("End"), { target: { value: "17:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ description: "Room 204", color: null, endMinutes: 1050 }),
    );
  });

  it("submits a work block's title unchanged", () => {
    const item = workItem();
    const { onSubmit } = renderEditor({ draft: { mode: "edit", item, span: SPAN } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ title: "History essay", startMinutes: 960, endMinutes: 1005 }),
    );
  });

  // An end above 1440 fits no `<input type="time">`; retyping the field must
  // not drop the day it belongs to.
  describe("a block that crosses midnight", () => {
    function renderCrossing() {
      const item = workItem({ endAt: instant("2026-09-09T04:30:00.000Z") });
      return renderEditor({ draft: { mode: "edit", item, span: CROSSING_SPAN } });
    }

    it("shows the wrapped reading and submits the end it really has", () => {
      const { onSubmit } = renderCrossing();

      expect(screen.getByLabelText<HTMLInputElement>("End").value).toBe("00:30");
      expect(screen.getByText(/23:30 – 00:30 next day/)).toBeDefined();

      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(onSubmit).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ startMinutes: 1410, endMinutes: 1470 }),
      );
    });

    it("carries the day onto a retyped end rather than collapsing the block", () => {
      const { onSubmit } = renderCrossing();

      fireEvent.change(screen.getByLabelText("End"), { target: { value: "01:00" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(screen.queryByText("The end has to come after the start.")).toBeNull();
      expect(onSubmit).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ startMinutes: 1410, endMinutes: 1500 }),
      );
    });
  });

  it("labels the completion control by what it will do (Domain Rule 13)", () => {
    const notLast = workItem();
    const { unmount } = render(
      <BlockEditor
        draft={{ mode: "edit", item: notLast, span: SPAN }}
        settings={SETTINGS}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onDelete={vi.fn()}
        onToggleComplete={vi.fn()}
        pending={false}
      />,
    );
    expect(screen.getByRole("button", { name: "Done with this block" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Complete task" })).toBeNull();
    unmount();

    const last = workItem({ work: { ...WORK, completesTask: true, blockCount: 1 } });
    renderEditor({ draft: { mode: "edit", item: last, span: SPAN } });
    expect(screen.getByRole("button", { name: "Complete task" })).toBeDefined();
  });

  it("reports completion and deletion to the board rather than mutating", () => {
    const item = workItem();
    const { onToggleComplete, onDelete } = renderEditor({
      draft: { mode: "edit", item, span: SPAN },
    });

    fireEvent.click(screen.getByRole("button", { name: "Done with this block" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(onToggleComplete).toHaveBeenCalledWith(item);
    expect(onDelete).toHaveBeenCalledWith(item);
  });

  it("offers no completion control on an event", () => {
    const event = workItem({ kind: "event", title: "Chemistry lecture", work: null });
    renderEditor({ draft: { mode: "edit", item: event, span: SPAN } });

    expect(screen.queryByRole("button", { name: /Done with this block|Complete task/ })).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>("Title").value).toBe("Chemistry lecture");
  });

  it("closes on Escape without emitting anything, and returns focus to the opener", async () => {
    const onSubmit = vi.fn();

    function Board() {
      const [draft, setDraft] = React.useState<BlockDraft | null>(null);
      return (
        <>
          <button type="button" onClick={() => setDraft(CREATE_DRAFT)}>
            Open
          </button>
          <BlockEditor
            draft={draft}
            settings={SETTINGS}
            onClose={() => setDraft(null)}
            onSubmit={onSubmit}
            onDelete={vi.fn()}
            onToggleComplete={vi.fn()}
            pending={false}
          />
        </>
      );
    }

    render(<Board />);
    const opener = screen.getByRole("button", { name: "Open" });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByLabelText("Title")).toBeDefined();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    expect(screen.queryByLabelText("Title")).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("returns focus in the commit that closes it, not after the sheet's exit", () => {
    // Radix restores focus after the sheet's exit animation, some 200ms
    // during which a fast `M` after Escape would be lost.
    function Board() {
      const [draft, setDraft] = React.useState<BlockDraft | null>(null);
      return (
        <>
          <button type="button" onClick={() => setDraft(CREATE_DRAFT)}>
            Open
          </button>
          <BlockEditor
            draft={draft}
            settings={SETTINGS}
            onClose={() => setDraft(null)}
            onSubmit={vi.fn()}
            onDelete={vi.fn()}
            onToggleComplete={vi.fn()}
            pending={false}
          />
        </>
      );
    }

    render(<Board />);
    const opener = screen.getByRole("button", { name: "Open" });
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(screen.getByLabelText("Title"));

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    // Synchronously: no `waitFor`, no timers.
    expect(document.activeElement).toBe(opener);
  });
});

describe("Start focus, from a work block", () => {
  function editDraft(item: CalendarItem): BlockDraft {
    return { mode: "edit", item, span: SPAN };
  }

  it("carries the task and the block's own length", () => {
    renderEditor({ draft: editDraft(workItem()) });

    expect(screen.getByRole("link", { name: "Start focus" }).getAttribute("href")).toBe(
      "/focus?task=task-1&minutes=45",
    );
  });

  it("suggests the schema's cap rather than a length the database would refuse", () => {
    renderEditor({
      draft: editDraft(
        workItem({
          startAt: instant("2026-09-08T08:00:00.000Z"),
          endAt: instant("2026-09-08T18:00:00.000Z"),
        }),
      ),
    });

    // Ten hours; `focus_planned_chk` allows four.
    expect(screen.getByRole("link", { name: "Start focus" }).getAttribute("href")).toBe(
      "/focus?task=task-1&minutes=240",
    );
  });

  it("is not offered on a block that has already been executed", () => {
    renderEditor({
      draft: editDraft(workItem({ completedAt: instant("2026-09-08T20:45:00.000Z") })),
    });

    expect(screen.queryByRole("link", { name: "Start focus" })).toBeNull();
  });

  it("is not offered on an event", () => {
    renderEditor({
      draft: editDraft(workItem({ kind: "event", work: null, title: "Lecture" })),
    });

    expect(screen.queryByRole("link", { name: "Start focus" })).toBeNull();
  });
});
