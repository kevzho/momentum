import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { localDate } from "@momentum/core/time";
import type { Uuid } from "@momentum/core/types";

import type { ProjectSummaryWithCount, TaskSummary } from "@/features/tasks/types";

const { pushMock, replaceMock, setTaskCompletionMock, createTaskMock, successToast, errorToast } =
  vi.hoisted(() => ({
    pushMock: vi.fn(),
    replaceMock: vi.fn(),
    setTaskCompletionMock: vi.fn(() => Promise.resolve({ ok: true as const, data: null })),
    createTaskMock: vi.fn(() => Promise.resolve({ ok: true as const, data: null })),
    successToast: vi.fn(),
    errorToast: vi.fn(),
  }));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: pushMock, replace: replaceMock, refresh: vi.fn() }),
}));

vi.mock("@momentum/ui/components/toast", () => ({
  toast: { success: successToast, error: errorToast, info: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/features/tasks/actions", () => ({
  setTaskCompletion: setTaskCompletionMock,
  createTask: createTaskMock,
}));

const { AnnouncerProvider } = await import("@momentum/ui/components/announcer");
const { PaletteProvider, usePalette } =
  await import("@/features/palette/components/palette-provider");
const { QuickAddProvider } = await import("@/features/tasks/components/quick-add");

const TODAY = localDate("2026-09-07");

const SCHOOL: ProjectSummaryWithCount = {
  id: "11111111-1111-4111-8111-111111111111" as Uuid,
  name: "School",
  color: "blue",
  openTasks: 2,
};

const TASKS: readonly TaskSummary[] = [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as Uuid,
    title: "Physics problem set",
    projectId: SCHOOL.id,
    priority: 1,
    dueDate: localDate("2026-09-11"),
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as Uuid,
    title: "Buy milk",
    projectId: null,
    priority: 4,
    dueDate: null,
  },
];

function Shell() {
  const palette = usePalette();
  return (
    <button type="button" onClick={() => palette.open()}>
      Search
    </button>
  );
}

function renderShell() {
  render(
    <AnnouncerProvider>
      <QuickAddProvider projects={[SCHOOL]} today={TODAY} weekStart={1}>
        <PaletteProvider projects={[SCHOOL]} tasks={TASKS} today={TODAY}>
          <Shell />
        </PaletteProvider>
      </QuickAddProvider>
    </AnnouncerProvider>,
  );
  return screen.getByRole("button", { name: "Search" });
}

async function openWithShortcut(key: { metaKey?: boolean; ctrlKey?: boolean } = { metaKey: true }) {
  fireEvent.keyDown(document, { key: "k", ...key });
  return screen.findByRole("dialog");
}

function paletteInput(): HTMLInputElement {
  return screen.getByRole("combobox");
}

function type(value: string) {
  fireEvent.change(paletteInput(), { target: { value } });
}

function options() {
  return screen.getAllByRole("option").map((option) => option.textContent ?? "");
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("opening and closing", () => {
  it("opens on ⌘K and on Ctrl+K", async () => {
    renderShell();

    await openWithShortcut({ metaKey: true });
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await openWithShortcut({ ctrlKey: true });
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("ignores a bare k, so typing one into a field does not open it", () => {
    renderShell();
    fireEvent.keyDown(document, { key: "k" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("traps focus while open and puts it back on the opener when closed", async () => {
    const opener = renderShell();
    opener.focus();

    const dialog = await openWithShortcut();
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(opener);
  });

  it("opens from the pointer as well as the keyboard", async () => {
    const opener = renderShell();
    fireEvent.click(opener);
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });
});

describe("searching and running", () => {
  it("lists the commands, grouped, before anything is typed", async () => {
    renderShell();
    await openWithShortcut();

    expect(screen.getByText("Go to")).toBeTruthy();
    expect(screen.getByText("Create")).toBeTruthy();
    expect(options().some((label) => label.includes("Calendar"))).toBe(true);
  });

  it("navigates with the arrow keys and runs the selection with Enter", async () => {
    renderShell();
    await openWithShortcut();

    type("calendar");
    await waitFor(() => expect(options().length).toBeGreaterThan(0));

    const input = paletteInput();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/calendar"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("finds the user's own tasks and projects, and opens the one chosen", async () => {
    renderShell();
    await openWithShortcut();

    type("physics");
    await waitFor(() => expect(options()[0]).toContain("Physics problem set"));

    fireEvent.keyDown(paletteInput(), { key: "Enter" });
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(`/tasks?task=${TASKS[0]?.id ?? ""}`));
  });

  it("says so when nothing matches, and keeps the input usable", async () => {
    renderShell();
    await openWithShortcut();

    type("zzzzzz");
    await waitFor(() => expect(screen.getByText("Nothing matches that.")).toBeTruthy());
    expect(paletteInput().value).toBe("zzzzzz");
  });

  it("announces how many results there are", async () => {
    renderShell();
    await openWithShortcut();
    type("physics");

    await waitFor(
      () => {
        const live = document.querySelector("[aria-live='polite']");
        expect(live?.textContent ?? "").toMatch(/1 result for physics/);
      },
      { timeout: 3_000 },
    );
  });
});

describe("the commands themselves", () => {
  it("opens Quick Add rather than navigating to the task list", async () => {
    renderShell();
    await openWithShortcut();

    type("add task");
    await waitFor(() => expect(options()[0]).toContain("Add task"));
    fireEvent.keyDown(paletteInput(), { key: "Enter" });

    const field = await screen.findByLabelText("Task title");
    expect(pushMock).not.toHaveBeenCalled();

    // The palette's focus restore must lose to the newly opened Quick Add.
    await waitFor(() => expect(document.activeElement).toBe(field));
    expect(screen.queryByLabelText("Search commands, tasks and projects")).toBeNull();
  });

  it("completes a task through the trusted action, in two more keystrokes", async () => {
    renderShell();
    await openWithShortcut();

    type("complete task");
    await waitFor(() => expect(options()[0]).toContain("Complete task"));
    fireEvent.keyDown(paletteInput(), { key: "Enter" });

    // The mode heading is also the dialog title, hence the selector.
    await waitFor(() =>
      expect(screen.getByText("Complete a task", { selector: "span" })).toBeTruthy(),
    );
    type("milk");
    await waitFor(() => expect(options()[0]).toContain("Buy milk"));
    fireEvent.keyDown(paletteInput(), { key: "Enter" });

    await waitFor(() =>
      expect(setTaskCompletionMock).toHaveBeenCalledWith({
        id: TASKS[1]?.id,
        completed: true,
      }),
    );
    await waitFor(() => expect(successToast).toHaveBeenCalledWith("Completed “Buy milk”"));
  });

  it("carries the intent to the calendar for a new event", async () => {
    renderShell();
    await openWithShortcut();

    type("add event");
    await waitFor(() => expect(options()[0]).toContain("Add event"));
    fireEvent.keyDown(paletteInput(), { key: "Enter" });

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/calendar?new=event"));
  });

  it("returns to the root list from a picker without closing", async () => {
    renderShell();
    await openWithShortcut();

    type("search projects");
    await waitFor(() => expect(options()[0]).toContain("Search projects"));
    fireEvent.keyDown(paletteInput(), { key: "Enter" });
    await waitFor(() =>
      expect(screen.getByText("Search projects", { selector: "span" })).toBeTruthy(),
    );

    // Backspace on an empty query is "up one level"; Escape still closes.
    fireEvent.keyDown(paletteInput(), { key: "Backspace" });
    await waitFor(() => expect(screen.getByText("Go to")).toBeTruthy());
    expect(screen.queryByRole("dialog")).toBeTruthy();
  });

  it("remembers what was run and offers it first next time", async () => {
    renderShell();
    await openWithShortcut();

    type("add event");
    await waitFor(() => expect(options()[0]).toContain("Add event"));
    fireEvent.keyDown(paletteInput(), { key: "Enter" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await openWithShortcut();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Recent")).toBeTruthy();
    expect(options()[0]).toContain("Add event");
  });
});

describe("the shortcut hint", () => {
  it("spells the chord the way this keyboard spells it", async () => {
    const { PaletteShortcut } = await import("@/features/palette/components/palette-shortcut");

    const apple = vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    const mac = render(<PaletteShortcut />);
    expect(mac.container.textContent).toBe("⌘K");
    mac.unmount();

    apple.mockReturnValue("Win32");
    expect(render(<PaletteShortcut />).container.textContent).toBe("Ctrl K");
    apple.mockRestore();
  });
});
