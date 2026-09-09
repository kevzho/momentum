import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { describe, expect, it, vi } from "vitest";

import { coverageOf } from "@momentum/core/tasks";
import { instant, localDate } from "@momentum/core/time";
import type { Task, Uuid } from "@momentum/core/types";

import { TaskList } from "@/features/tasks/components/task-list";
import type { TaskRowData } from "@/features/tasks/components/task-list-row";

const TODAY = localDate("2026-09-07");

function task(id: string, title: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    userId: "u",
    projectId: null,
    parentTaskId: null,
    title,
    description: null,
    status: "open",
    priority: 4,
    estimatedMinutes: null,
    actualMinutes: 0,
    dueDate: null,
    completedAt: null,
    archivedAt: null,
    sortOrder: 0,
    createdAt: instant("2026-09-01T00:00:00.000Z"),
    updatedAt: instant("2026-09-01T00:00:00.000Z"),
    ...overrides,
  };
}

function row(id: string, title: string, overrides: Partial<Task> = {}): TaskRowData {
  return {
    task: task(id, title, overrides),
    project: null,
    coverage: coverageOf(null, 0),
    blockCount: 0,
    subtaskCount: 0,
    completedSubtaskCount: 0,
  };
}

const ROWS: TaskRowData[] = [
  row("a", "Read chapter 4"),
  row("b", "Draft the essay"),
  row("c", "Email the tutor"),
];

interface Handlers {
  onToggleComplete?: (id: Uuid, completed: boolean) => void;
  onUnarchive?: (id: Uuid) => void;
  onOpen?: (id: Uuid) => void;
  onMove?: (id: Uuid, toIndex: number) => void;
}

// Holds focus and selection the way `TasksView` does.
function Harness({ rows = ROWS, handlers = {} }: { rows?: TaskRowData[]; handlers?: Handlers }) {
  const [focusedId, setFocusedId] = React.useState<Uuid | null>(rows[0]?.task.id ?? null);
  const [selectedIds, setSelectedIds] = React.useState<ReadonlySet<Uuid>>(new Set());

  return (
    <DndContext id="test">
      <span data-testid="selected">{[...selectedIds].sort().join(",")}</span>
      <span data-testid="focused">{focusedId}</span>
      <TaskList
        rows={rows}
        today={TODAY}
        view="all"
        filtered={false}
        selectedIds={selectedIds}
        pendingIds={new Set()}
        focusedId={focusedId}
        onFocusedIdChange={setFocusedId}
        onToggleComplete={handlers.onToggleComplete ?? (() => {})}
        onUnarchive={handlers.onUnarchive ?? (() => {})}
        onOpen={handlers.onOpen ?? (() => {})}
        onSelectionChange={setSelectedIds}
        onMove={handlers.onMove ?? (() => {})}
      />
    </DndContext>
  );
}

const list = () => screen.getByRole("list", { name: "Tasks" });
const focused = () => screen.getByTestId("focused").textContent;
const selected = () => screen.getByTestId("selected").textContent;

describe("the list is one tab stop", () => {
  it("gives the tab stop to the focused row and takes it from the rest", () => {
    render(<Harness />);
    const rows = screen.getAllByRole("listitem");

    expect(rows[0]).toHaveProperty("tabIndex", 0);
    expect(rows[1]).toHaveProperty("tabIndex", -1);
    expect(rows[2]).toHaveProperty("tabIndex", -1);
  });

  // `role="option"` and `role="button"` are children-presentational in ARIA
  // and would flatten both checkboxes out of every row.
  it("keeps both of a row's checkboxes in the accessibility tree", () => {
    render(<Harness />);

    expect(screen.getByRole("checkbox", { name: 'Complete "Read chapter 4"' })).toBeDefined();
    expect(screen.getByRole("checkbox", { name: 'Select "Read chapter 4"' })).toBeDefined();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("announces the selection on the row itself", () => {
    render(<Harness />);
    fireEvent.keyDown(list(), { key: "x" });

    const row = screen.getAllByRole("listitem")[0] as HTMLElement;
    const describedBy = row.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy as string)?.textContent).toBe("Selected");
  });
});

describe("move", () => {
  it("moves the cursor with the arrow keys", () => {
    render(<Harness />);

    fireEvent.keyDown(list(), { key: "ArrowDown" });
    expect(focused()).toBe("b");

    fireEvent.keyDown(list(), { key: "ArrowDown" });
    expect(focused()).toBe("c");

    fireEvent.keyDown(list(), { key: "ArrowUp" });
    expect(focused()).toBe("b");
  });

  it("stops at each end rather than wrapping", () => {
    render(<Harness />);

    fireEvent.keyDown(list(), { key: "ArrowUp" });
    expect(focused()).toBe("a");

    fireEvent.keyDown(list(), { key: "End" });
    expect(focused()).toBe("c");
    fireEvent.keyDown(list(), { key: "ArrowDown" });
    expect(focused()).toBe("c");

    fireEvent.keyDown(list(), { key: "Home" });
    expect(focused()).toBe("a");
  });
});

describe("open and complete", () => {
  it("opens the focused task with Enter", () => {
    const onOpen = vi.fn();
    render(<Harness handlers={{ onOpen }} />);

    fireEvent.keyDown(list(), { key: "ArrowDown" });
    fireEvent.keyDown(list(), { key: "Enter" });

    expect(onOpen).toHaveBeenCalledWith("b");
  });

  it("completes the focused task with Space, and reopens a completed one", () => {
    const onToggleComplete = vi.fn();
    render(<Harness handlers={{ onToggleComplete }} />);

    fireEvent.keyDown(list(), { key: " " });
    expect(onToggleComplete).toHaveBeenCalledWith("a", true);

    const done = [row("a", "Read chapter 4", { status: "completed" }), ...ROWS.slice(1)];
    render(<Harness rows={done} handlers={{ onToggleComplete }} />);
    fireEvent.keyDown(screen.getAllByRole("list", { name: "Tasks" })[1] as HTMLElement, {
      key: " ",
    });
    expect(onToggleComplete).toHaveBeenLastCalledWith("a", false);
  });
});

describe("archived rows", () => {
  it("unarchives with Space instead of completing", () => {
    const onToggleComplete = vi.fn();
    const onUnarchive = vi.fn();
    const rows = [row("a", "Old idea", { status: "archived" }), ...ROWS.slice(1)];
    render(<Harness rows={rows} handlers={{ onToggleComplete, onUnarchive }} />);

    fireEvent.keyDown(list(), { key: " " });

    expect(onUnarchive).toHaveBeenCalledWith("a");
    expect(onToggleComplete).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: 'Unarchive "Old idea"' })).toBeDefined();
  });
});

describe("select", () => {
  it("adds and removes the focused task with X", () => {
    render(<Harness />);

    fireEvent.keyDown(list(), { key: "x" });
    expect(selected()).toBe("a");

    fireEvent.keyDown(list(), { key: "ArrowDown" });
    fireEvent.keyDown(list(), { key: "x" });
    expect(selected()).toBe("a,b");

    fireEvent.keyDown(list(), { key: "x" });
    expect(selected()).toBe("a");
  });

  it("extends a range with Shift and the arrow keys", () => {
    render(<Harness />);

    fireEvent.keyDown(list(), { key: "ArrowDown", shiftKey: true });
    expect(selected()).toBe("a,b");

    fireEvent.keyDown(list(), { key: "ArrowDown", shiftKey: true });
    expect(selected()).toBe("a,b,c");

    // Reversing shrinks the range from the anchor.
    fireEvent.keyDown(list(), { key: "ArrowUp", shiftKey: true });
    expect(selected()).toBe("a,b");
  });

  it("selects everything with the platform's select-all, and clears with Escape", () => {
    render(<Harness />);

    fireEvent.keyDown(list(), { key: "a", metaKey: true });
    expect(selected()).toBe("a,b,c");

    fireEvent.keyDown(list(), { key: "Escape" });
    expect(selected()).toBe("");
  });

  it("does not treat a bare A as select-all — it is a character, not a command", () => {
    render(<Harness />);
    fireEvent.keyDown(list(), { key: "a" });
    expect(selected()).toBe("");
  });
});

describe("reorder — the drag's keyboard path (Domain Rule 10)", () => {
  it("moves the focused task down and up with Alt and the arrow keys", () => {
    const onMove = vi.fn();
    render(<Harness handlers={{ onMove }} />);

    fireEvent.keyDown(list(), { key: "ArrowDown", altKey: true });
    expect(onMove).toHaveBeenCalledWith("a", 1);

    fireEvent.keyDown(list(), { key: "ArrowDown" });
    fireEvent.keyDown(list(), { key: "ArrowUp", altKey: true });
    expect(onMove).toHaveBeenLastCalledWith("b", 0);
  });

  it("refuses to move past either end", () => {
    const onMove = vi.fn();
    render(<Harness handlers={{ onMove }} />);

    fireEvent.keyDown(list(), { key: "ArrowUp", altKey: true });
    expect(onMove).not.toHaveBeenCalled();

    fireEvent.keyDown(list(), { key: "End" });
    fireEvent.keyDown(list(), { key: "ArrowDown", altKey: true });
    expect(onMove).not.toHaveBeenCalled();
  });

  it("does not move the cursor when it is reordering", () => {
    render(<Harness handlers={{ onMove: () => {} }} />);

    fireEvent.keyDown(list(), { key: "ArrowDown", altKey: true });
    // The cursor stays on the task that moved, not on the position it left.
    expect(focused()).toBe("a");
  });
});

describe("empty states", () => {
  it("says what this view being empty means", () => {
    render(<Harness rows={[]} />);
    expect(screen.getByText("No open tasks")).toBeDefined();
  });

  it("says something different when a filter is what emptied it", () => {
    render(
      <DndContext id="test">
        <TaskList
          rows={[]}
          today={TODAY}
          view="all"
          filtered
          selectedIds={new Set()}
          pendingIds={new Set()}
          focusedId={null}
          onFocusedIdChange={() => {}}
          onToggleComplete={() => {}}
          onUnarchive={() => {}}
          onOpen={() => {}}
          onSelectionChange={() => {}}
          onMove={() => {}}
        />
      </DndContext>,
    );

    expect(screen.getByText("No tasks match these filters")).toBeDefined();
  });
});

describe("when the focused row leaves the view", () => {
  it("hands focus to the row that took its place", () => {
    const view = render(<Harness />);
    const first = screen.getAllByRole("listitem")[0] as HTMLLIElement;
    first.focus();
    expect(document.activeElement).toBe(first);

    // The completed row is gone from the view, as `selectTasks` would drop it.
    view.rerender(<Harness rows={ROWS.slice(1)} />);

    expect(focused()).toBe("b");
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(screen.getAllByRole("listitem")[0]);
  });

  it("does not steal focus from elsewhere when a row leaves on its own", () => {
    render(
      <>
        <button type="button">Elsewhere</button>
        <Harness />
      </>,
    );
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    elsewhere.focus();

    // The effect moves the tab stop but leaves the user's focus where it is.
    expect(document.activeElement).toBe(elsewhere);
  });
});
