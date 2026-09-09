import * as React from "react";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ianaTimeZone, instant, localDate } from "@momentum/core/time";
import type { Task } from "@momentum/core/types";

import type { ActionResult } from "@/lib/actions/result";
import type { TasksPageData } from "@/features/tasks/types";

const { errorToast, setTaskCompletionMock, reorderTaskMock } = vi.hoisted(() => ({
  errorToast: vi.fn(),
  setTaskCompletionMock: vi.fn(),
  reorderTaskMock: vi.fn(),
}));

vi.mock("@momentum/ui/components/toast", () => ({
  toast: {
    error: errorToast,
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock("@/features/tasks/actions", () => ({
  setTaskCompletion: setTaskCompletionMock,
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  archiveTask: vi.fn(),
  reorderTask: reorderTaskMock,
  bulkSetCompletion: vi.fn(),
  bulkMoveToProject: vi.fn(),
  bulkDeleteTasks: vi.fn(),
  addWorkBlock: vi.fn(),
  updateWorkBlock: vi.fn(),
  removeWorkBlock: vi.fn(),
}));

const { useTaskMutations } = await import("@/features/tasks/use-task-mutations");
const { UserSettingsProvider } = await import("@/lib/time/user-settings");

const TASK: Task = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "u",
  projectId: null,
  parentTaskId: null,
  title: "History essay",
  description: null,
  status: "open",
  priority: 4,
  estimatedMinutes: 135,
  actualMinutes: 0,
  dueDate: localDate("2026-09-11"),
  completedAt: null,
  archivedAt: null,
  sortOrder: 0,
  createdAt: instant("2026-09-01T00:00:00.000Z"),
  updatedAt: instant("2026-09-01T00:00:00.000Z"),
};

// Server truth: one open task with two work blocks. Props never change.
const SERVER_STATE: TasksPageData = {
  today: localDate("2026-09-07"),
  timezone: ianaTimeZone("America/New_York"),
  tasks: [TASK],
  workBlocks: {
    [TASK.id]: [
      {
        id: "b1",
        startAt: instant("2026-09-07T14:00:00.000Z"),
        endAt: instant("2026-09-07T14:45:00.000Z"),
        date: localDate("2026-09-07"),
        startMinutes: 600,
        endMinutes: 645,
        minutes: 45,
        completedAt: null,
      },
      {
        id: "b2",
        startAt: instant("2026-09-08T15:00:00.000Z"),
        endAt: instant("2026-09-08T16:00:00.000Z"),
        date: localDate("2026-09-08"),
        startMinutes: 660,
        endMinutes: 720,
        minutes: 60,
        completedAt: null,
      },
    ],
  },
  projects: [],
};

function deferred<T>() {
  let settle: (value: T) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle: (value: T) => settle(value) };
}

function Harness() {
  const { state, pending, mutate } = useTaskMutations(SERVER_STATE);
  const task = state.tasks[0] as Task;

  return (
    <div>
      <output data-testid="status">{task.status}</output>
      <output data-testid="blocks">{(state.workBlocks[task.id] ?? []).length}</output>
      <span data-testid="pending">{pending ? "pending" : "idle"}</span>
      <button type="button" onClick={() => mutate.setCompletion(task.id, true)}>
        Complete
      </button>
    </div>
  );
}

function renderHarness() {
  return render(
    <UserSettingsProvider
      settings={{ timezone: SERVER_STATE.timezone, weekStart: 1, snapMinutes: 15 }}
    >
      <Harness />
    </UserSettingsProvider>,
  );
}

const status = () => screen.getByTestId("status").textContent;

describe("optimistic completion", () => {
  it("shows the task complete before the server has answered", async () => {
    const inFlight = deferred<ActionResult<Task>>();
    setTaskCompletionMock.mockReturnValueOnce(inFlight.promise);
    renderHarness();

    expect(status()).toBe("open");

    await act(async () => {
      screen.getByRole("button", { name: "Complete" }).click();
    });

    expect(status()).toBe("completed");
    expect(screen.getByTestId("pending").textContent).toBe("pending");

    await act(async () => {
      inFlight.settle({ ok: true, data: { ...TASK, status: "completed" } });
    });
  });

  it("leaves the task's work blocks untouched while completing (Domain Rule 13)", async () => {
    const inFlight = deferred<ActionResult<Task>>();
    setTaskCompletionMock.mockReturnValueOnce(inFlight.promise);
    renderHarness();

    await act(async () => {
      screen.getByRole("button", { name: "Complete" }).click();
    });

    expect(screen.getByTestId("blocks").textContent).toBe("2");

    await act(async () => {
      inFlight.settle({ ok: true, data: { ...TASK, status: "completed" } });
    });
    expect(screen.getByTestId("blocks").textContent).toBe("2");
  });

  it("rolls back to the server's truth when the write fails", async () => {
    setTaskCompletionMock.mockResolvedValueOnce({
      ok: false,
      error: { code: "forbidden", message: "That task belongs to another account." },
    } satisfies ActionResult<Task>);
    renderHarness();

    await act(async () => {
      screen.getByRole("button", { name: "Complete" }).click();
    });

    expect(status()).toBe("open");
    expect(screen.getByTestId("pending").textContent).toBe("idle");
  });

  it("surfaces the server's own message, with a retry", async () => {
    setTaskCompletionMock.mockResolvedValueOnce({
      ok: false,
      error: { code: "unavailable", message: "The database is unreachable." },
    } satisfies ActionResult<Task>);
    renderHarness();

    await act(async () => {
      screen.getByRole("button", { name: "Complete" }).click();
    });

    expect(errorToast).toHaveBeenCalledWith(
      "The database is unreachable.",
      expect.objectContaining({ action: expect.objectContaining({ label: "Retry" }) }),
    );
  });

  it("stays rolled back after a second failure, rather than accumulating", async () => {
    setTaskCompletionMock.mockResolvedValue({
      ok: false,
      error: { code: "unavailable", message: "Still unreachable." },
    } satisfies ActionResult<Task>);
    renderHarness();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await act(async () => {
        screen.getByRole("button", { name: "Complete" }).click();
      });
      expect(status()).toBe("open");
    }
  });
});

describe("reorder", () => {
  const flat = ["a", "b", "c"].map((id) => ({
    ...TASK,
    id: `${id}${id}${id}${id}${id}${id}${id}${id}-${id}${id}${id}${id}-4${id}${id}${id}-8${id}${id}${id}-${id}${id}${id}${id}${id}${id}${id}${id}${id}${id}${id}${id}`,
    title: id,
  }));

  function ReorderHarness() {
    const { state, mutate } = useTaskMutations({ ...SERVER_STATE, tasks: flat });
    const [issued, setIssued] = React.useState<string>("untried");
    const ordered = [...state.tasks].sort((x, y) => x.sortOrder - y.sortOrder);

    return (
      <div>
        <output data-testid="order">{ordered.map((task) => task.title).join(",")}</output>
        <output data-testid="issued">{issued}</output>
        <button
          type="button"
          onClick={() => setIssued(String(mutate.reorder(flat[2]!.id, ordered, 1)))}
        >
          Move c up
        </button>
        <button
          type="button"
          onClick={() => setIssued(String(mutate.reorder(flat[0]!.id, ordered, 0)))}
        >
          Move a nowhere
        </button>
      </div>
    );
  }

  function renderReorder() {
    return render(
      <UserSettingsProvider
        settings={{ timezone: SERVER_STATE.timezone, weekStart: 1, snapMinutes: 15 }}
      >
        <ReorderHarness />
      </UserSettingsProvider>,
    );
  }

  it("writes the whole tied run in one batch and reports that it did", async () => {
    const inFlight = deferred<ActionResult<Task[]>>();
    reorderTaskMock.mockReturnValueOnce(inFlight.promise);
    renderReorder();

    await act(async () => {
      screen.getByRole("button", { name: "Move c up" }).click();
    });

    // Every row is at 0, so no single number can put c between a and b: the
    // batch carries every row whose number changes.
    expect(screen.getByTestId("issued").textContent).toBe("true");
    expect(screen.getByTestId("order").textContent).toBe("a,c,b");
    const [input] = reorderTaskMock.mock.calls[0] as [{ orders: { id: string }[] }];
    expect(input.orders.length).toBeGreaterThan(1);

    await act(async () => {
      inFlight.settle({ ok: true, data: [] });
    });
  });

  it("writes nothing, and says so, for a move that changes nothing", async () => {
    renderReorder();

    await act(async () => {
      screen.getByRole("button", { name: "Move a nowhere" }).click();
    });

    expect(screen.getByTestId("issued").textContent).toBe("false");
    expect(reorderTaskMock).not.toHaveBeenCalled();
  });
});
