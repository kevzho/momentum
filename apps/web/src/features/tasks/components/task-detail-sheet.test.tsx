import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { instant, localDate } from "@momentum/core/time";
import type { Task } from "@momentum/core/types";

import { TaskDetailSheet } from "@/features/tasks/components/task-detail-sheet";

const TODAY = localDate("2026-09-07");

const TASK: Task = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "u",
  projectId: null,
  parentTaskId: null,
  title: "Problem set 4",
  description: null,
  status: "open",
  priority: 4,
  estimatedMinutes: 120,
  actualMinutes: 0,
  dueDate: localDate("2026-09-11"),
  completedAt: null,
  archivedAt: null,
  sortOrder: 0,
  createdAt: instant("2026-09-01T00:00:00.000Z"),
  updatedAt: instant("2026-09-01T00:00:00.000Z"),
};

type SheetProps = React.ComponentProps<typeof TaskDetailSheet>;

function sheetProps(overrides: Partial<SheetProps> = {}): SheetProps {
  return {
    task: TASK,
    subtasks: [],
    workBlocks: [],
    projects: [],
    today: TODAY,
    weekStart: 1,
    pending: false,
    pendingIds: new Set(),
    onOpenChange: vi.fn(),
    onPatch: vi.fn(),
    onToggleComplete: vi.fn(),
    onDelete: vi.fn(),
    onArchive: vi.fn(),
    onUnarchive: vi.fn(),
    onAddBlock: vi.fn(),
    onUpdateBlock: vi.fn(),
    onRemoveBlock: vi.fn(),
    onAddSubtask: vi.fn(),
    onMoveSubtask: vi.fn(),
    ...overrides,
  };
}

function renderSheet(overrides: Partial<SheetProps> = {}) {
  const onPatch = vi.fn();
  render(<TaskDetailSheet {...sheetProps({ onPatch, ...overrides })} />);
  return onPatch;
}

describe("the title field", () => {
  it("commits the edit on blur", () => {
    const onPatch = renderSheet();
    const title = screen.getByLabelText<HTMLInputElement>("Title");

    title.focus();
    fireEvent.change(title, { target: { value: "Problem set 5" } });
    fireEvent.blur(title);

    expect(onPatch).toHaveBeenCalledWith(TASK.id, { title: "Problem set 5" });
  });

  it("abandons the edit on Escape rather than committing it", () => {
    const onPatch = renderSheet();
    const title = screen.getByLabelText<HTMLInputElement>("Title");

    // Genuinely focused, so a `blur()` in the component would really dispatch
    // (synchronously, before React re-renders with the reset draft).
    title.focus();
    expect(document.activeElement).toBe(title);
    fireEvent.change(title, { target: { value: "DELETE ME" } });
    fireEvent.keyDown(title, { key: "Escape" });

    expect(onPatch).not.toHaveBeenCalled();
    expect(title.value).toBe("Problem set 4");
  });

  it("commits again after an abandoned edit", () => {
    const onPatch = renderSheet();
    const title = screen.getByLabelText<HTMLInputElement>("Title");

    title.focus();
    fireEvent.change(title, { target: { value: "DELETE ME" } });
    fireEvent.keyDown(title, { key: "Escape" });

    // A leaked editing flag would silently swallow every later commit.
    title.focus();
    fireEvent.change(title, { target: { value: "Problem set 5" } });
    fireEvent.blur(title);

    expect(onPatch).toHaveBeenCalledWith(TASK.id, { title: "Problem set 5" });
  });
});

describe("closing the sheet", () => {
  it("returns focus to whatever opened it", async () => {
    function Harness() {
      const [task, setTask] = React.useState<Task | null>(null);
      return (
        <>
          <button type="button" onClick={() => setTask(TASK)}>
            Problem set 4
          </button>
          <TaskDetailSheet
            task={task}
            subtasks={[]}
            workBlocks={[]}
            projects={[]}
            today={TODAY}
            weekStart={1}
            pending={false}
            pendingIds={new Set()}
            onOpenChange={(open) => {
              if (!open) setTask(null);
            }}
            onPatch={vi.fn()}
            onToggleComplete={vi.fn()}
            onDelete={vi.fn()}
            onArchive={vi.fn()}
            onUnarchive={vi.fn()}
            onAddBlock={vi.fn()}
            onUpdateBlock={vi.fn()}
            onRemoveBlock={vi.fn()}
            onAddSubtask={vi.fn()}
            onMoveSubtask={vi.fn()}
          />
        </>
      );
    }

    render(<Harness />);
    const row = screen.getByRole("button", { name: "Problem set 4" });
    row.focus();
    fireEvent.click(row);
    await screen.findByLabelText("Title");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => expect(document.activeElement).toBe(row));
  });
});

describe("the subtask reorder arrows", () => {
  const subtask = (id: string, title: string, sortOrder: number): Task => ({
    ...TASK,
    id,
    parentTaskId: TASK.id,
    title,
    dueDate: null,
    estimatedMinutes: null,
    sortOrder,
  });

  const FIRST = subtask("22222222-2222-4222-8222-222222222222", "Read the brief", 0);
  const SECOND = subtask("33333333-3333-4333-8333-333333333333", "Draft the outline", 1);

  it("keeps its own press from disabling the button under the cursor", () => {
    const onMoveSubtask = vi.fn();
    const view = render(
      <TaskDetailSheet {...sheetProps({ subtasks: [FIRST, SECOND], onMoveSubtask })} />,
    );

    const up = screen.getByRole("button", { name: 'Move "Draft the outline" up' });
    up.focus();
    expect(document.activeElement).toBe(up);

    fireEvent.click(up);
    expect(onMoveSubtask).toHaveBeenCalledWith(SECOND.id, 0);

    // An instant later: the reorder is in flight and the overlay has already
    // put the row at the top, so both "disabled" conditions are true.
    view.rerender(
      <TaskDetailSheet
        {...sheetProps({ subtasks: [SECOND, FIRST], pending: true, onMoveSubtask })}
      />,
    );

    // jsdom does not implement blur-on-disable, so the native attribute is
    // what is asserted, not `document.activeElement`.
    expect(document.activeElement).toBe(up);
    expect(up.hasAttribute("disabled")).toBe(false);
    expect(up.getAttribute("aria-disabled")).toBe("true");
  });

  it("stays inert when it is pressed at the end it points towards", () => {
    const onMoveSubtask = vi.fn();
    render(<TaskDetailSheet {...sheetProps({ subtasks: [FIRST, SECOND], onMoveSubtask })} />);

    const up = screen.getByRole("button", { name: 'Move "Read the brief" up' });
    expect(up.getAttribute("aria-disabled")).toBe("true");

    // `aria-disabled` does not stop a click; the handler's guard does.
    fireEvent.click(up);
    expect(onMoveSubtask).not.toHaveBeenCalled();
  });
});

describe("Start focus", () => {
  it("links to the focus screen with the task pre-selected", () => {
    renderSheet();

    const link = screen.getByRole("link", { name: "Start focus" });
    expect(link.getAttribute("href")).toBe(`/focus?task=${TASK.id}`);
  });

  it("navigates rather than starting a session, so following it twice starts one", () => {
    // A link, not a button: navigation must not start a session.
    renderSheet();

    expect(screen.getByRole("link", { name: "Start focus" }).tagName).toBe("A");
    expect(screen.queryByRole("button", { name: "Start focus" })).toBeNull();
  });

  it("is not offered on a completed task", () => {
    renderSheet({ task: { ...TASK, status: "completed", completedAt: TASK.createdAt } });

    expect(screen.queryByRole("link", { name: "Start focus" })).toBeNull();
  });
});

describe("committing without losing the keyboard", () => {
  it("commits on Enter and keeps the field focused", () => {
    const onPatch = renderSheet();
    const title = screen.getByLabelText<HTMLInputElement>("Title");

    title.focus();
    fireEvent.change(title, { target: { value: "Problem set 5" } });
    fireEvent.keyDown(title, { key: "Enter" });

    expect(onPatch).toHaveBeenCalledWith(TASK.id, { title: "Problem set 5" });
    expect(document.activeElement).toBe(title);

    // The blur that follows does not commit the same text twice.
    fireEvent.blur(title);
    expect(onPatch).toHaveBeenCalledTimes(1);
  });

  it("disables nothing natively while a write is in flight", () => {
    render(<TaskDetailSheet {...sheetProps({ pending: true })} />);

    for (const name of ["Archive", "Delete", "Complete task", "Add work block"]) {
      const button = screen.getByRole("button", { name });
      expect(button.hasAttribute("disabled")).toBe(false);
      expect(button.getAttribute("aria-disabled")).toBe("true");
    }
    expect(screen.getByLabelText<HTMLInputElement>("Title").disabled).toBe(false);
    expect(screen.getByLabelText<HTMLTextAreaElement>("Notes").disabled).toBe(false);
    expect(screen.getByLabelText<HTMLInputElement>("New subtask").disabled).toBe(false);
  });

  it("keeps a guarded button inert while pending", () => {
    const onToggleComplete = vi.fn();
    render(<TaskDetailSheet {...sheetProps({ pending: true, onToggleComplete })} />);

    fireEvent.click(screen.getByRole("button", { name: "Complete task" }));
    expect(onToggleComplete).not.toHaveBeenCalled();
  });
});

describe("Escape inside a field", () => {
  it("abandons the edit and leaves the sheet open", async () => {
    const onOpenChange = vi.fn();
    const onPatch = renderSheet({ onOpenChange });
    const title = screen.getByLabelText<HTMLInputElement>("Title");

    title.focus();
    fireEvent.change(title, { target: { value: "DELETE ME" } });
    // Bubbles so Radix's own capture-phase document listener runs too.
    fireEvent.keyDown(title, { key: "Escape", bubbles: true });

    expect(onPatch).not.toHaveBeenCalled();
    expect(title.value).toBe("Problem set 4");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    // A second Escape, from a field no longer editing, closes the sheet.
    fireEvent.keyDown(title, { key: "Escape", bubbles: true });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("abandons the notes too, rather than committing them on the way out", () => {
    const onOpenChange = vi.fn();
    const onPatch = renderSheet({ onOpenChange });
    const notes = screen.getByLabelText<HTMLTextAreaElement>("Notes");

    notes.focus();
    fireEvent.change(notes, { target: { value: "half a thought" } });
    fireEvent.keyDown(notes, { key: "Escape", bubbles: true });

    expect(onPatch).not.toHaveBeenCalled();
    expect(notes.value).toBe("");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe("deleting from the sheet", () => {
  it("asks first, with what cascades, and only the confirmation deletes", async () => {
    const onDelete = vi.fn();
    render(<TaskDetailSheet {...sheetProps({ onDelete, cascade: { subtasks: 2, blocks: 3 } })} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog", { name: "Delete “Problem set 4”?" });
    expect(dialog.textContent).toContain("Its 2 subtasks and 3 work blocks are deleted too.");
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" })),
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete", hidden: false }));
    // Two buttons read "Delete" now: the sheet's (behind the modal) and the dialog's.
    const confirm = [...dialog.querySelectorAll("button")].find(
      (button) => button.textContent === "Delete",
    ) as HTMLButtonElement;
    fireEvent.click(confirm);

    expect(onDelete).toHaveBeenCalledWith(TASK.id);
  });
});

describe("a refused write", () => {
  it("is shown next to the fields it rolled back, in the server's words", () => {
    render(
      <TaskDetailSheet
        {...sheetProps({
          failure: {
            code: "validation",
            message: "An estimate is at most one week.",
            fieldErrors: { estimatedMinutes: ["An estimate is at most one week."] },
          },
        })}
      />,
    );

    expect(screen.getByRole("alert").textContent).toBe("An estimate is at most one week.");
  });
});

describe("an archived task", () => {
  it("offers Unarchive in place of Archive, and no completion", async () => {
    const onUnarchive = vi.fn();
    render(
      <TaskDetailSheet
        {...sheetProps({
          task: {
            ...TASK,
            status: "archived",
            archivedAt: instant("2026-09-05T10:00:00.000Z"),
          },
          onUnarchive,
        })}
      />,
    );

    await screen.findByRole("dialog");
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Complete task" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Unarchive" }));
    expect(onUnarchive).toHaveBeenCalledWith(TASK.id);
  });
});
