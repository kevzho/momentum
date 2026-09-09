import * as React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { localDate } from "@momentum/core/time";

import type { ActionResult } from "@/lib/actions/result";

/**
 * Quick Add's two contracts beyond "a title is enough".
 *
 * **One gesture owns one id.** The create carries a client-generated UUID so a
 * retry after a lost response collides with the row that already committed and
 * is absorbed as a success (Domain Rule 17). Minting a fresh id per attempt
 * turns that guarantee into a duplicate task.
 *
 * **Closing puts the user back.** It is opened by `Q` from anywhere, so there is
 * no trigger for Radix to restore focus to and the user would otherwise be
 * dropped on `<body>` (Domain Rule 10).
 *
 * **A rejected call is a toast, not a blank route.** `createTask` reports
 * failure by returning, but the *call* can still reject before it has an answer
 * to return, and React re-throws a rejection out of a transition — which would
 * hand the whole page the user pressed `Q` on to an error boundary. Quick Add
 * is the one write outside `useOptimisticAction`, so it restates that hook's
 * rule here (Domain Rule 11).
 */

const { createTaskMock, errorToast, successToast, pushMock, reportError } = vi.hoisted(() => ({
  createTaskMock: vi.fn(),
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

/*
 * Only `useRouter` is replaced. `unstable_rethrow` and `redirect` stay real, or
 * the test that pins "a redirect is control flow, not failure" would be pinning
 * a stub of the very function under test.
 */
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/features/tasks/actions", () => ({ createTask: createTaskMock }));

vi.mock("@/lib/report-error", () => ({ reportError }));

const { QuickAddProvider, useQuickAdd } = await import("@/features/tasks/components/quick-add");
const { ErrorBoundary } = await import("@/components/error-boundary");

const TODAY = localDate("2026-09-07");

/** The shell, minimally: something to open Quick Add from, and to come back to. */
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

/** The same shell, with a project for `#school` to resolve against. */
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

/**
 * The Retry the failure offers — inside the dialog, under the field. A toast
 * behind a modal is under its pointer lock and outside its focus trap, so the
 * failure is rendered where the user can reach it.
 */
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
    // The same row, offered to the server twice — `createTask` absorbs the
    // unique violation and returns the existing task.
    expect(idsCreated()[0]).toBe(idsCreated()[1]);
  });

  it("gives the next task its own id after one is added", async () => {
    createTaskMock.mockResolvedValue({ ok: true, data: null } as ActionResult<unknown>);

    const opener = renderShell();
    const field = await openAndType(opener, "Buy milk");

    // Shift+Enter keeps the dialog open for the next capture.
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
    // Offline, a 5xx, an action id gone stale after a deploy: the call rejects
    // before the action has an `{ ok: false }` to return.
    createTaskMock.mockRejectedValue(new Error("Failed to fetch"));

    const opener = renderShell();
    const field = await openAndType(opener, "Buy milk");

    await act(async () => {
      fireEvent.keyDown(field, { key: "Enter" });
    });

    // The server's own `unavailable` wording, so there is one message for
    // "could not reach the server" whichever side noticed.
    expect(failureShown()).toContain(
      "Momentum could not reach the server. Your change was not saved.",
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();

    // Swallowed for the user, not for us.
    expect(reportError).toHaveBeenCalledTimes(1);

    // The dialog is still standing and still holds the title: a rejection
    // re-thrown out of the transition would have taken the route with it.
    expect(screen.getByLabelText<HTMLInputElement>("Task title").value).toBe("Buy milk");

    await act(async () => {
      retryInline();
    });

    // Domain Rule 17 holds on this path too — a rejection is exactly the case
    // where the write may have committed without the answer coming back.
    expect(idsCreated()).toHaveLength(2);
    expect(idsCreated()[0]).toBe(idsCreated()[1]);
  });

  it("lets a redirect through, because that is control flow and not failure", async () => {
    // `redirect()` travels as a thrown value. Turning it into a toast would
    // strand the user on the page they were being moved off, so
    // `unstable_rethrow` re-throws it and the boundary above takes it.
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
    // The boundary reports it, as it reports anything it catches; what matters
    // is that `submit` never claimed it as a transport failure of its own.
    expect(reportError).not.toHaveBeenCalledWith(expect.anything(), { source: "quickAdd" });
  });

  it("returns focus to whatever opened it", async () => {
    const opener = renderShell();
    opener.focus();
    fireEvent.click(opener);
    const field = await screen.findByLabelText("Task title");

    // The field is focused without `autoFocus`, which would have run before
    // Radix could record where the user came from.
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

    // The date is cleared and its word is back in the title — nothing typed is
    // lost, and the estimate beside it is unaffected.
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

    // No title left, so there is nothing to create — and nothing was thrown.
    // `aria-disabled`, not the native attribute: the browser blurs a natively
    // disabled control, and Add is one that disables itself by working.
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
    // Retrying the same input cannot succeed, so nothing offers to.
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(errorToast).not.toHaveBeenCalled();
    // The dialog is still standing, with the title, for the user to fix.
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

    // Escape closes the dialog, but it is not "throw this away".
    fireEvent.keyDown(field, { key: "Escape" });
    await waitFor(() => expect(screen.queryByLabelText("Task title")).toBeNull());

    fireEvent.click(opener);
    const reopened = await screen.findByLabelText<HTMLInputElement>("Task title");
    expect(reopened.value).toBe("Book the dentist");

    // Cancel is.
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByLabelText("Task title")).toBeNull());

    fireEvent.click(opener);
    expect((await screen.findByLabelText<HTMLInputElement>("Task title")).value).toBe("");
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

    // Filed into the project the page was showing, and placed first in the
    // list rather than tied with every other capture at 0.
    expect(created()).toMatchObject({ projectId: SCHOOL.id, sortOrder: -7 });
  });
});
