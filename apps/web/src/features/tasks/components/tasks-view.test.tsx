import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ianaTimeZone, instant, localDate } from "@momentum/core/time";
import type { Task } from "@momentum/core/types";

import type { TasksPageData } from "@/features/tasks/types";
import type { TaskParams } from "@/features/tasks/view-params";

const {
  bulkDeleteMock,
  bulkCompleteMock,
  bulkMoveMock,
  reorderTaskMock,
  archiveTaskMock,
  updateTaskMock,
} = vi.hoisted(() => ({
  archiveTaskMock: vi.fn(() => Promise.resolve({ ok: true as const, data: null })),
  updateTaskMock: vi.fn(() => Promise.resolve({ ok: true as const, data: null })),
  bulkDeleteMock: vi.fn(() => Promise.resolve({ ok: true as const, data: { ids: [] } })),
  bulkCompleteMock: vi.fn(),
  reorderTaskMock: vi.fn(() => Promise.resolve({ ok: true as const, data: [] })),
  // Awaited to completion by a test, so it must resolve to a real result;
  // a bare `vi.fn()` resolves to `undefined` and the hook reads `.ok` off it.
  bulkMoveMock: vi.fn(() => Promise.resolve({ ok: true as const, data: [] })),
}));

const { replaceMock, createProjectMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  createProjectMock: vi.fn(),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), replace: replaceMock, refresh: vi.fn() }),
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

vi.mock("@/features/projects/actions", () => ({
  createProject: createProjectMock,
  updateProject: vi.fn(),
  archiveProject: vi.fn(),
}));

vi.mock("@/features/tasks/actions", () => ({
  createTask: vi.fn(),
  updateTask: updateTaskMock,
  deleteTask: vi.fn(),
  archiveTask: archiveTaskMock,
  reorderTask: reorderTaskMock,
  setTaskCompletion: vi.fn(),
  bulkSetCompletion: bulkCompleteMock,
  bulkMoveToProject: bulkMoveMock,
  bulkDeleteTasks: bulkDeleteMock,
  addWorkBlock: vi.fn(),
  updateWorkBlock: vi.fn(),
  removeWorkBlock: vi.fn(),
}));
// Quick Add creates events too; the calendar action is server-only.
vi.mock("@/features/calendar/actions", () => ({ createBlock: vi.fn() }));

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

function renderView(params: Partial<TaskParams> = {}) {
  render(
    <UserSettingsProvider settings={{ timezone: TIMEZONE, weekStart: 1, snapMinutes: 15 }}>
      <TasksView
        data={DATA}
        params={{ view: "all", projectId: null, taskId: null, newProject: false, ...params }}
      />
    </UserSettingsProvider>,
  );
  // The preferences store caches module state; this cross-tab event makes it
  // re-read the storage `beforeEach` cleared.
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
          params={{ view: "all", projectId: null, taskId: null, newProject: false }}
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

    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(bulkDeleteMock).not.toHaveBeenCalled();
    expect(screen.getByRole("toolbar", { name: "2 tasks selected" })).toBeDefined();
  });

  it("moves the selection into a project created from the move menu", async () => {
    createProjectMock.mockImplementation((input: { id: string; name: string; color: string }) =>
      Promise.resolve({
        ok: true,
        data: {
          id: input.id,
          userId: "u",
          name: input.name,
          description: null,
          color: input.color,
          icon: null,
          archivedAt: null,
          createdAt: "2026-09-07T12:00:00.000Z",
          updatedAt: "2026-09-07T12:00:00.000Z",
        },
      }),
    );
    renderView();
    select("Read chapter 4");
    select("Draft the essay");

    fireEvent.pointerDown(screen.getByRole("button", { name: "Move to project" }), {
      button: 0,
      pointerType: "mouse",
    });
    fireEvent.click(await screen.findByRole("menuitem", { name: "New project…" }), {
      pointerType: "mouse",
    });

    // Choosing it keeps the selection: the move waits for the project.
    const dialog = await screen.findByRole("dialog", { name: "New project" });
    // Behind the modal, so out of the accessibility tree (and role queries) while it is open.
    expect(document.querySelector('[role="toolbar"]')?.getAttribute("aria-label")).toBe(
      "2 tasks selected",
    );
    expect(bulkMoveMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Thesis" } });
    fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(createProjectMock).toHaveBeenCalledTimes(1));
    const projectId = (createProjectMock.mock.calls[0]?.[0] as { id: string }).id;
    await waitFor(() =>
      expect(bulkMoveMock).toHaveBeenCalledWith({
        ids: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
        projectId,
      }),
    );
    await waitFor(() => expect(bar()).toBeNull());
    // The Move trigger left with the bar, so focus lands on the list's anchor, not <body>.
    await waitFor(() =>
      expect(document.activeElement).toBe(document.getElementById("task-list-keys")),
    );
  });

  it("files the open task into a project created from the sheet's picker", async () => {
    createProjectMock.mockImplementation((input: { id: string; name: string; color: string }) =>
      Promise.resolve({
        ok: true,
        data: {
          id: input.id,
          userId: "u",
          name: input.name,
          description: null,
          color: input.color,
          icon: null,
          archivedAt: null,
          createdAt: "2026-09-07T12:00:00.000Z",
          updatedAt: "2026-09-07T12:00:00.000Z",
        },
      }),
    );
    const taskId = "11111111-1111-4111-8111-111111111111";
    renderView({ taskId });

    const sheet = await screen.findByRole("dialog", { name: "Read chapter 4" });
    const picker = within(sheet).getByRole("combobox", { name: "Project" });
    fireEvent.click(picker);
    fireEvent.click(await screen.findByRole("option", { name: "New project…" }));

    const dialog = await screen.findByRole("dialog", { name: "New project" });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Thesis" } });
    fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(createProjectMock).toHaveBeenCalledTimes(1));
    const projectId = (createProjectMock.mock.calls[0]?.[0] as { id: string }).id;
    await waitFor(() =>
      expect(updateTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: taskId, projectId }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New project" })).toBeNull());

    // Shown from the manager's own list before the server sends it back, and
    // the picker that asked is where focus returns.
    expect(picker.textContent).toContain("Thesis");
    expect(document.activeElement).toBe(picker);
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

describe("focus after the bar acts", () => {
  // The list's key hint: the anchor focus returns to.
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
    // The button that opened the confirmation goes with the bar, so the
    // dialog's own restore falls back.
    fireEvent.click(await screen.findByRole("button", { name: "Delete 3 tasks" }));

    // The list itself is gone; an anchor on the `<ul>` would have unmounted too.
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

    // The menu traps focus and Radix's restore aims at a trigger that went
    // with the bar, so focus is placed from the menu's close hook, a tick later.
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

describe("announcing a reorder", () => {
  const liveRegion = () =>
    [...document.querySelectorAll("[aria-live]")].map((node) => node.textContent ?? "").join(" ");

  it("says where the task went once the write is issued, and nothing for a no-op", async () => {
    render(
      <AnnouncerProvider>
        <UserSettingsProvider settings={{ timezone: TIMEZONE, weekStart: 1, snapMinutes: 15 }}>
          <TasksView
            data={DATA}
            params={{ view: "all", projectId: null, taskId: null, newProject: false }}
          />
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

    // Down into the tie: the batch is written and the announcement follows the write.
    fireEvent.keyDown(first, { key: "ArrowDown", altKey: true });
    await waitFor(() => expect(reorderTaskMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(liveRegion()).toContain("Read chapter 4 moved to position 2 of 3"));
  });
});

describe("the archived view", () => {
  const ARCHIVED: Task = {
    ...task("44444444-4444-4444-8444-444444444444", "Old idea"),
    status: "archived",
    archivedAt: instant("2026-09-05T10:00:00.000Z"),
  };

  function renderArchived(view: "all" | "archived") {
    render(
      <UserSettingsProvider settings={{ timezone: TIMEZONE, weekStart: 1, snapMinutes: 15 }}>
        <TasksView
          data={{ ...DATA, tasks: [...DATA.tasks, ARCHIVED] }}
          params={{ view, projectId: null, taskId: null, newProject: false }}
        />
      </UserSettingsProvider>,
    );
    fireEvent(window, new Event("storage"));
  }

  it("lists archived tasks there and nowhere else, with the count on the tab", () => {
    renderArchived("all");
    expect(screen.queryByText("Old idea")).toBeNull();
    expect(screen.getByRole("link", { name: /^Archived/ }).textContent).toContain("1");
  });

  it("unarchives from the row, optimistically, through the archive action", async () => {
    renderArchived("archived");
    expect(screen.getByText("Old idea")).toBeDefined();
    expect(screen.queryByRole("checkbox", { name: 'Complete "Old idea"' })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: 'Unarchive "Old idea"' }));

    await waitFor(() => expect(screen.queryByText("Old idea")).toBeNull());
    expect(archiveTaskMock).toHaveBeenCalledWith({ id: ARCHIVED.id, archived: false });
  });
});

describe("the new-project intent", () => {
  it("opens the project dialog, drops the intent from the URL and has somewhere to return focus", async () => {
    render(
      <UserSettingsProvider settings={{ timezone: TIMEZONE, weekStart: 1, snapMinutes: 15 }}>
        <TasksView
          data={DATA}
          params={{ view: "all", projectId: null, taskId: null, newProject: true }}
        />
      </UserSettingsProvider>,
    );

    const dialog = await screen.findByRole("dialog", { name: "New project" });
    expect(replaceMock).toHaveBeenCalledWith("/tasks?view=all", { scroll: false });

    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "New task" }));
  });
});
