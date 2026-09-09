import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ianaTimeZone, instant, localDate } from "@momentum/core/time";
import type { Task } from "@momentum/core/types";

import type { TasksPageData } from "@/features/tasks/types";

/**
 * The bulk bar acts on what the user can see.
 *
 * Complete, Move and Delete are irreversible from this surface — there is no
 * confirmation and no undo — so the set the bar counts and the set the mutation
 * receives have to be the same set, and both have to be rows that are on screen.
 * A selection made before a filter was typed is not a licence to delete rows the
 * filter has since hidden.
 */

const { bulkDeleteMock, bulkCompleteMock, bulkMoveMock, reorderTaskMock } = vi.hoisted(() => ({
  bulkDeleteMock: vi.fn(() => Promise.resolve({ ok: true as const, data: { ids: [] } })),
  bulkCompleteMock: vi.fn(),
  reorderTaskMock: vi.fn(() => Promise.resolve({ ok: true as const, data: [] })),
  // Unlike its two neighbours, this one is awaited to completion by a test, so
  // it has to answer in the shape every action answers in — a bare `vi.fn()`
  // resolves to `undefined` and the hook reads `.ok` off it.
  bulkMoveMock: vi.fn(() => Promise.resolve({ ok: true as const, data: [] })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@momentum/ui/components/toast", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock("@/features/tasks/actions", () => ({
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  archiveTask: vi.fn(),
  reorderTask: reorderTaskMock,
  setTaskCompletion: vi.fn(),
  bulkSetCompletion: bulkCompleteMock,
  bulkMoveToProject: bulkMoveMock,
  bulkDeleteTasks: bulkDeleteMock,
  addWorkBlock: vi.fn(),
  updateWorkBlock: vi.fn(),
  removeWorkBlock: vi.fn(),
}));

const { TasksView } = await import("@/features/tasks/components/tasks-view");
const { AnnouncerProvider } = await import("@momentum/ui/components/announcer");
const { UserSettingsProvider } = await import("@/lib/time/user-settings");

const TIMEZONE = ianaTimeZone("America/New_York");

function task(id: string, title: string): Task {
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
  };
}

const DATA: TasksPageData = {
  today: localDate("2026-09-07"),
  timezone: TIMEZONE,
  tasks: [
    task("11111111-1111-4111-8111-111111111111", "Read chapter 4"),
    task("22222222-2222-4222-8222-222222222222", "Draft the essay"),
    task("33333333-3333-4333-8333-333333333333", "Email the tutor"),
  ],
  workBlocks: {},
  projects: [],
};

function renderView() {
  render(
    <UserSettingsProvider settings={{ timezone: TIMEZONE, weekStart: 1, snapMinutes: 15 }}>
      <TasksView data={DATA} params={{ view: "all", projectId: null, taskId: null }} />
    </UserSettingsProvider>,
  );
  // Sort and filter are module state cached across a session. `beforeEach`
  // empties the storage behind it; this is the cross-tab event that makes the
  // store re-read it, so every test starts from the default preferences.
  fireEvent(window, new Event("storage"));
}

const bar = () => screen.queryByRole("toolbar", { name: /selected$/ });

function select(title: string): void {
  fireEvent.click(screen.getByRole("checkbox", { name: `Select "${title}"` }));
}

function search(text: string): void {
  fireEvent.change(screen.getByLabelText("Filter tasks by title"), { target: { value: text } });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

describe("bulk selection", () => {
  it("counts the rows it will act on", () => {
    renderView();
    select("Read chapter 4");
    select("Draft the essay");

    expect(bar()).not.toBeNull();
    expect(screen.getByRole("toolbar", { name: "2 tasks selected" })).toBeDefined();
  });

  it("drops out of the bar's reach when a filter hides every selected row", () => {
    renderView();
    select("Read chapter 4");
    select("Draft the essay");

    search("zzz");

    // Nothing is on screen to act on, so there is nothing to act with — the bar
    // is gone rather than offering Delete over three invisible rows.
    expect(bar()).toBeNull();
    expect(screen.getByText("No tasks match these filters")).toBeDefined();
  });

  it("deletes only the rows still visible under a narrowed filter", async () => {
    renderView();
    select("Read chapter 4");
    select("Draft the essay");
    select("Email the tutor");

    search("essay");

    expect(screen.getByRole("toolbar", { name: "1 task selected" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete 1 task" }));

    expect(bulkDeleteMock).toHaveBeenCalledWith({
      ids: ["22222222-2222-4222-8222-222222222222"],
    });
  });

  /**
   * Deleting cascades to subtasks and work blocks and has no undo, so the bar
   * asks first — with the count, with what goes, and with Cancel holding focus
   * so Enter alone cannot delete.
   */
  it("asks before deleting, defaults to not deleting, and says what cascades", async () => {
    render(
      <UserSettingsProvider settings={{ timezone: TIMEZONE, weekStart: 1, snapMinutes: 15 }}>
        <TasksView
          data={{
            ...DATA,
            tasks: [
              ...DATA.tasks,
              {
                ...task("44444444-4444-4444-8444-444444444444", "Find sources"),
                parentTaskId: "22222222-2222-4222-8222-222222222222",
              },
            ],
            workBlocks: {
              "11111111-1111-4111-8111-111111111111": [
                {
                  id: "b1",
                  startAt: instant("2026-09-07T14:00:00.000Z"),
                  endAt: instant("2026-09-07T15:00:00.000Z"),
                  date: localDate("2026-09-07"),
                  startMinutes: 600,
                  endMinutes: 660,
                  minutes: 60,
                  completedAt: null,
                },
              ],
            },
          }}
          params={{ view: "all", projectId: null, taskId: null }}
        />
      </UserSettingsProvider>,
    );
    fireEvent(window, new Event("storage"));
    select("Read chapter 4");
    select("Draft the essay");

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    const dialog = await screen.findByRole("dialog", { name: "Delete 2 tasks?" });
    expect(dialog.textContent).toContain("Their 1 subtask and 1 work block are deleted too.");
    expect(bulkDeleteMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" })),
    );

    // Escape is "no".
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(bulkDeleteMock).not.toHaveBeenCalled();
    expect(screen.getByRole("toolbar", { name: "2 tasks selected" })).toBeDefined();
  });

  it("restores a selection the filter had hidden when the filter is cleared", () => {
    renderView();
    select("Read chapter 4");
    select("Draft the essay");

    search("essay");
    expect(screen.getByRole("toolbar", { name: "1 task selected" })).toBeDefined();

    search("");
    expect(screen.getByRole("toolbar", { name: "2 tasks selected" })).toBeDefined();
  });
});

/**
 * Where the keyboard goes when the bar disappears out from under it.
 *
 * Every one of the bar's controls empties the selection, and an empty selection
 * is what unmounts the bar — so each of them removes the pressed button as a
 * direct result of being pressed. There is no focus scope to restore anything,
 * so without a handoff the browser leaves focus on `<body>` and the user tabs
 * back from the top of the shell (Domain Rule 10).
 */
describe("focus after the bar acts", () => {
  /** The list's key hint: its `aria-describedby`, and the anchor focus returns to. */
  const anchor = () => document.getElementById("task-list-keys");

  it("hands focus to the list when a bulk action unmounts the bar", () => {
    renderView();
    select("Read chapter 4");
    select("Draft the essay");

    const complete = screen.getByRole("button", { name: "Complete" });
    complete.focus();
    expect(document.activeElement).toBe(complete);

    fireEvent.click(complete);

    expect(bar()).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(anchor());
  });

  it("still has somewhere to put focus when the action empties the list", async () => {
    renderView();
    select("Read chapter 4");
    select("Draft the essay");
    select("Email the tutor");

    const remove = screen.getByRole("button", { name: "Delete" });
    remove.focus();
    fireEvent.click(remove);
    // Through the confirmation: the button that opened it goes with the bar,
    // so the dialog's own restore has nothing to return to and falls back.
    fireEvent.click(await screen.findByRole("button", { name: "Delete 3 tasks" }));

    // The list itself is gone, which is why the anchor sits beside it rather
    // than inside it: an anchor on the `<ul>` would have unmounted here too.
    expect(screen.getByText("No open tasks")).toBeDefined();
    await waitFor(() => expect(document.activeElement).toBe(anchor()));
    expect(document.activeElement).not.toBe(document.body);
  });

  it("holds it against the menu's own restore on the Move to project path", async () => {
    renderView();
    select("Read chapter 4");

    fireEvent.pointerDown(screen.getByRole("button", { name: "Move to project" }), {
      button: 0,
      pointerType: "mouse",
    });
    const item = await screen.findByRole("menuitem", { name: "No project" });
    fireEvent.click(item, { pointerType: "mouse" });

    /*
     * The one path with a competitor. An open menu traps focus, so the handoff
     * the three buttons make from inside their own handler is dragged back into
     * the menu here and lost when it closes; Radix then aims its restore at a
     * trigger that went with the bar. The menu's close hook is where this path
     * has to place focus, and it does so a tick after the click.
     */
    expect(bulkMoveMock).toHaveBeenCalledWith({
      ids: ["11111111-1111-4111-8111-111111111111"],
      projectId: null,
    });
    await waitFor(() => expect(bar()).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(anchor()));
    expect(document.activeElement).not.toBe(document.body);
  });

  it("hands focus on from Clear selection too, which changes no rows at all", () => {
    renderView();
    select("Read chapter 4");

    const clear = screen.getByRole("button", { name: "Clear selection" });
    clear.focus();
    fireEvent.click(clear);

    expect(bar()).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(anchor());
  });
});

/**
 * A keyboard reorder is announced — but only when it happened. A never-reordered
 * list is one long tie at `sortOrder` 0, and a move inside it used to write
 * nothing while the live region still said "moved to position 2".
 */
describe("announcing a reorder", () => {
  const liveRegion = () =>
    [...document.querySelectorAll("[aria-live]")].map((node) => node.textContent ?? "").join(" ");

  it("says where the task went once the write is issued, and nothing for a no-op", async () => {
    render(
      <AnnouncerProvider>
        <UserSettingsProvider settings={{ timezone: TIMEZONE, weekStart: 1, snapMinutes: 15 }}>
          <TasksView data={DATA} params={{ view: "all", projectId: null, taskId: null }} />
        </UserSettingsProvider>
      </AnnouncerProvider>,
    );
    fireEvent(window, new Event("storage"));
    const rows = screen.getAllByRole("listitem");
    const first = rows[0] as HTMLElement;
    first.focus();

    // Up from the top: nothing to write, so nothing to say.
    fireEvent.keyDown(first, { key: "ArrowUp", altKey: true });
    expect(reorderTaskMock).not.toHaveBeenCalled();
    expect(liveRegion()).not.toContain("moved to position");

    // Down into the tie: the run is spread, the batch is written, and the
    // announcement follows the write rather than the keystroke.
    fireEvent.keyDown(first, { key: "ArrowDown", altKey: true });
    await waitFor(() => expect(reorderTaskMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(liveRegion()).toContain("Read chapter 4 moved to position 2 of 3"));
  });
});
