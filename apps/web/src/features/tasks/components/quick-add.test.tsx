import * as React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { localDate } from "@momentum/core/time";

import type { ActionResult } from "@/lib/actions/result";

const { createTaskMock, createProjectMock, errorToast, successToast, pushMock, reportError } =
  vi.hoisted(() => ({
    createTaskMock: vi.fn(),
    createProjectMock: vi.fn(),
    errorToast: vi.fn(),
    successToast: vi.fn(),
    pushMock: vi.fn(),
    reportError: vi.fn(),
  }));

vi.mock("@momentum/ui/components/toast", () => ({
  toast: {
    error: errorToast,
    success: successToast,
    info: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
  },
}));

// Only `useRouter` is replaced: `unstable_rethrow` and `redirect` must stay
// real for the redirect test to mean anything.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/features/tasks/actions", () => ({ createTask: createTaskMock }));
vi.mock("@/features/projects/actions", () => ({
  createProject: createProjectMock,
  updateProject: vi.fn(),
  archiveProject: vi.fn(),
}));

vi.mock("@/lib/report-error", () => ({ reportError }));

const { QuickAddProvider, useQuickAdd } = await import("@/features/tasks/components/quick-add");
const { ErrorBoundary } = await import("@/components/error-boundary");

const TODAY = localDate("2026-09-07");

function Shell() {
  const quickAdd = useQuickAdd();
  return (
    <button type="button" onClick={() => quickAdd.open()}>
      New task
    </button>
  );
}

function renderShell() {
  render(
    <QuickAddProvider projects={[]} today={TODAY} weekStart={1}>
      <Shell />
    </QuickAddProvider>,
  );
  return screen.getByRole("button", { name: "New task" });
}

const SCHOOL = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "School",
  color: "blue" as const,
};

function renderShellWithProjects() {
  render(
    <QuickAddProvider projects={[SCHOOL]} today={TODAY} weekStart={1}>
      <Shell />
    </QuickAddProvider>,
  );
  return screen.getByRole("button", { name: "New task" });
}

const created = () => (createTaskMock.mock.calls.at(-1)?.[0] ?? {}) as Record<string, unknown>;

async function openAndType(opener: HTMLElement, title: string) {
  opener.focus();
  fireEvent.click(opener);
  const field = await screen.findByLabelText<HTMLInputElement>("Task title");
  fireEvent.change(field, { target: { value: title } });
  return field;
}

function retryInline(): void {
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
}

const failureShown = () =>
  screen
    .getAllByRole("alert")
    .map((alert) => alert.textContent ?? "")
    .join(" ");

const idsCreated = () => createTaskMock.mock.calls.map(([input]) => (input as { id: string }).id);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Quick Add", () => {
  it("retries with the id the first attempt used, so a lost response cannot duplicate the task", async () => {
    createTaskMock.mockResolvedValue({
      ok: false,
      error: { code: "unavailable", message: "Something went wrong. Please try again." },
    } satisfies ActionResult<never>);

    const opener = renderShell();
    const field = await openAndType(opener, "Buy milk");

    await act(async () => {
      fireEvent.keyDown(field, { key: "Enter" });
    });
    expect(failureShown()).toContain("Something went wrong. Please try again.");
    expect(errorToast).not.toHaveBeenCalled();

    await act(async () => {
      retryInline();
    });

    expect(idsCreated()).toHaveLength(2);
    // The same id twice: `createTask` absorbs the unique violation.
    expect(idsCreated()[0]).toBe(idsCreated()[1]);
  });

  it("gives the next task its own id after one is added", async () => {
    createTaskMock.mockResolvedValue({ ok: true, data: null } as ActionResult<unknown>);

    const opener = renderShell();
    const field = await openAndType(opener, "Buy milk");

    await act(async () => {
      fireEvent.keyDown(field, { key: "Enter", shiftKey: true });
    });
    fireEvent.change(field, { target: { value: "Book the dentist" } });
    await act(async () => {
      fireEvent.keyDown(field, { key: "Enter", shiftKey: true });
    });

    expect(idsCreated()).toHaveLength(2);
    expect(idsCreated()[0]).not.toBe(idsCreated()[1]);
  });

  it("turns a rejected call into the same inline failure, with a Retry that keeps the id", async () => {
    // The call rejects before the action has an `{ ok: false }` to return.
    createTaskMock.mockRejectedValue(new Error("Failed to fetch"));

    const opener = renderShell();
    const field = await openAndType(opener, "Buy milk");

    await act(async () => {
      fireEvent.keyDown(field, { key: "Enter" });
    });

    expect(failureShown()).toContain(
      "Momentum could not reach the server. Your change was not saved.",
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();

    expect(reportError).toHaveBeenCalledTimes(1);

    // A rejection re-thrown out of the transition would have taken the route with it.
    expect(screen.getByLabelText<HTMLInputElement>("Task title").value).toBe("Buy milk");

    await act(async () => {
      retryInline();
    });

    expect(idsCreated()).toHaveLength(2);
    expect(idsCreated()[0]).toBe(idsCreated()[1]);
  });

  it("lets a redirect through, because that is control flow and not failure", async () => {
    // `redirect()` travels as a thrown value; `unstable_rethrow` must let it through.
    createTaskMock.mockImplementation(() => redirect("/login"));

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary section="Quick Add">
        <QuickAddProvider projects={[]} today={TODAY} weekStart={1}>
          <Shell />
        </QuickAddProvider>
      </ErrorBoundary>,
    );
    const field = await openAndType(screen.getByRole("button", { name: "New task" }), "Buy milk");

    await act(async () => {
      fireEvent.keyDown(field, { key: "Enter" });
    });

    consoleError.mockRestore();

    expect(screen.getByRole("alert").textContent).toContain("Quick Add could not be loaded");
    expect(errorToast).not.toHaveBeenCalled();
    // The boundary reports it; `submit` must not have claimed it as its own failure.
    expect(reportError).not.toHaveBeenCalledWith(expect.anything(), { source: "quickAdd" });
  });

  it("returns focus to whatever opened it", async () => {
    const opener = renderShell();
    opener.focus();
    fireEvent.click(opener);
    const field = await screen.findByLabelText("Task title");

    await waitFor(() => expect(document.activeElement).toBe(field));

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});

describe("natural-language capture", () => {
  beforeEach(() => {
    createTaskMock.mockResolvedValue({ ok: true, data: null } as ActionResult<unknown>);
  });

  it("fills every field from one line, and keeps only the title in the title", async () => {
    const field = await openAndType(
      renderShellWithProjects(),
      "Finish essay tomorrow 60m p1 #school",
    );

    await act(async () => {
      fireEvent.keyDown(field, { key: "Enter" });
    });

    expect(created()).toMatchObject({
      title: "Finish essay",
      dueDate: "2026-09-08",
      estimatedMinutes: 60,
      priority: 1,
      projectId: SCHOOL.id,
    });
  });

  it("shows what it understood as chips, before anything is created", async () => {
    await openAndType(renderShellWithProjects(), "Finish essay tomorrow 60m p1 #school");

    const chips = screen.getByRole("group", { name: "Understood from the title" });
    expect(chips.textContent).toBe(
      "TomorrowRemove Tomorrow and keep “tomorrow” in the title1hRemove 1h and keep “60m” in the titleP1Remove P1 and keep “p1” in the titleSchoolRemove School and keep “#school” in the title",
    );
    expect(createTaskMock).not.toHaveBeenCalled();
  });

  it("keeps text it does not understand, and offers no chips for it", async () => {
    const field = await openAndType(renderShellWithProjects(), "read p1 of the paper");

    expect(screen.queryByRole("group", { name: "Understood from the title" })).toBeNull();

    await act(async () => {
      fireEvent.keyDown(field, { key: "Enter" });
    });

    expect(created()).toMatchObject({
      title: "read p1 of the paper",
      priority: 4,
      dueDate: null,
    });
  });

  it("returns the words to the title when a chip is removed", async () => {
    const field = await openAndType(renderShellWithProjects(), "Finish essay tomorrow 60m");

    fireEvent.click(
      screen.getByRole("button", { name: "Remove Tomorrow and keep “tomorrow” in the title" }),
    );

    await act(async () => {
      fireEvent.keyDown(field, { key: "Enter" });
    });

    expect(created()).toMatchObject({
      title: "Finish essay tomorrow",
      dueDate: null,
      estimatedMinutes: 60,
    });
  });

  it("hands a field over to its control, and the words back to the title", async () => {
    const field = await openAndType(renderShellWithProjects(), "Finish essay 60m");
    const estimate = screen.getByLabelText<HTMLInputElement>("Estimate");
    expect(estimate.value).toBe("1h");

    fireEvent.focus(estimate);
    fireEvent.change(estimate, { target: { value: "2h" } });
    fireEvent.blur(estimate);

    await waitFor(() =>
      expect(screen.queryByRole("group", { name: "Understood from the title" })).toBeNull(),
    );

    await act(async () => {
      fireEvent.keyDown(field, { key: "Enter" });
    });

    expect(created()).toMatchObject({ title: "Finish essay 60m", estimatedMinutes: 120 });
  });

  it("stays typable when the line is nothing but metadata", async () => {
    const field = await openAndType(renderShellWithProjects(), "tomorrow 60m");

    // No title left, so nothing to create; `aria-disabled` rather than native.
    expect(screen.getByRole("button", { name: "Add task" }).getAttribute("aria-disabled")).toBe(
      "true",
    );

    fireEvent.change(field, { target: { value: "Essay tomorrow 60m" } });
    await act(async () => {
      fireEvent.keyDown(field, { key: "Enter" });
    });
    expect(created()).toMatchObject({ title: "Essay" });
  });

  it("starts the next capture clean after Shift+Enter", async () => {
    const field = await openAndType(renderShellWithProjects(), "Finish essay tomorrow");

    await act(async () => {
      fireEvent.keyDown(field, { key: "Enter", shiftKey: true });
    });

    expect(field.value).toBe("");
    expect(screen.queryByRole("group", { name: "Understood from the title" })).toBeNull();
  });
});

describe("failures inside the dialog", () => {
  it("puts a validation message on the field, and offers no Retry for it", async () => {
    createTaskMock.mockResolvedValue({
      ok: false,
      error: {
        code: "validation",
        message: "Titles are at most 500 characters.",
        fieldErrors: { title: ["Titles are at most 500 characters."] },
      },
    } satisfies ActionResult<never>);

    const field = await openAndType(renderShell(), "Buy milk");
    await act(async () => {
      fireEvent.keyDown(field, { key: "Enter" });
    });

    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(field.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Titles are at most 500 characters.",
    );
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(errorToast).not.toHaveBeenCalled();
    expect(field.value).toBe("Buy milk");
  });

  it("refuses an over-long title on the field before sending it", async () => {
    const field = await openAndType(renderShell(), "x".repeat(501));

    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(failureShown()).toContain("Titles are at most 500 characters.");

    await act(async () => {
      fireEvent.keyDown(field, { key: "Enter" });
    });
    expect(createTaskMock).not.toHaveBeenCalled();
  });

  it("keeps the field focused while the write is in flight", async () => {
    let settle: (value: ActionResult<unknown>) => void = () => {};
    createTaskMock.mockReturnValue(
      new Promise<ActionResult<unknown>>((resolve) => {
        settle = resolve;
      }),
    );

    const opener = renderShell();
    const field = await openAndType(opener, "Buy milk");
    await waitFor(() => expect(document.activeElement).toBe(field));

    await act(async () => {
      fireEvent.keyDown(field, { key: "Enter", shiftKey: true });
    });

    // Not natively disabled, so the browser has nothing to blur.
    expect(field.hasAttribute("disabled")).toBe(false);
    expect(document.activeElement).toBe(field);

    await act(async () => {
      settle({ ok: true, data: null });
    });
  });
});

describe("what survives a dismissal", () => {
  it("offers an escaped title back on the next opening, and forgets a cancelled one", async () => {
    const opener = renderShell();
    const field = await openAndType(opener, "Book the dentist");

    // Escape closes the dialog but keeps the draft.
    fireEvent.keyDown(field, { key: "Escape" });
    await waitFor(() => expect(screen.queryByLabelText("Task title")).toBeNull());

    fireEvent.click(opener);
    const reopened = await screen.findByLabelText<HTMLInputElement>("Task title");
    expect(reopened.value).toBe("Book the dentist");

    // Cancel discards it.
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByLabelText("Task title")).toBeNull());

    fireEvent.click(opener);
    expect((await screen.findByLabelText<HTMLInputElement>("Task title")).value).toBe("");
  });
});

describe("creating a project from the picker", () => {
  it("opens the project dialog, then selects what it saved and files the task there", async () => {
    createTaskMock.mockResolvedValue({ ok: true, data: null } as ActionResult<unknown>);
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

    const field = await openAndType(renderShellWithProjects(), "Finish essay");
    const picker = screen.getByRole("combobox", { name: "Project" });
    expect(picker.textContent).toContain("No project");

    fireEvent.click(picker);
    fireEvent.click(await screen.findByRole("option", { name: "New project…" }));

    const dialog = await screen.findByRole("dialog", { name: "New project" });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Thesis" } });
    fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(createProjectMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New project" })).toBeNull());
    // Listed before the server's list has caught up: the shell still passes `[SCHOOL]`.
    await waitFor(() => expect(picker.textContent).toContain("Thesis"));

    await act(async () => {
      fireEvent.keyDown(field, { key: "Enter" });
    });

    const projectId = (createProjectMock.mock.calls[0]?.[0] as { id: string }).id;
    expect(created()).toMatchObject({ title: "Finish essay", projectId });
  });
});

describe("what the page underneath seeds", () => {
  it("opens with the page's project from Q, the same as from its own button", async () => {
    createTaskMock.mockResolvedValue({ ok: true, data: null } as ActionResult<unknown>);

    function ProjectPage() {
      const quickAdd = useQuickAdd();
      React.useEffect(() => {
        quickAdd.setDefaults({ projectId: SCHOOL.id });
        return () => quickAdd.setDefaults({});
      }, [quickAdd]);
      return <p>School</p>;
    }

    render(
      <QuickAddProvider projects={[SCHOOL]} today={TODAY} weekStart={1} newTaskSortOrder={-7}>
        <ProjectPage />
      </QuickAddProvider>,
    );

    fireEvent.keyDown(document.body, { key: "q" });
    const field = await screen.findByLabelText<HTMLInputElement>("Task title");
    fireEvent.change(field, { target: { value: "Read chapter 4" } });
    await act(async () => {
      fireEvent.keyDown(field, { key: "Enter" });
    });

    expect(created()).toMatchObject({ projectId: SCHOOL.id, sortOrder: -7 });
  });
});
