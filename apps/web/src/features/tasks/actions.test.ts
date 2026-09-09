import { beforeEach, describe, expect, it, vi } from "vitest";

import { instant, localDate } from "@momentum/core/time";
import type { Task } from "@momentum/core/types";

const { completeMock, uncompleteMock, updateMock, refreshMock, revalidatePathMock } = vi.hoisted(
  () => ({
    completeMock: vi.fn(),
    uncompleteMock: vi.fn(),
    updateMock: vi.fn(),
    refreshMock: vi.fn(),
    revalidatePathMock: vi.fn(),
  }),
);

vi.mock("next/cache", () => ({ refresh: refreshMock, revalidatePath: revalidatePathMock }));

vi.mock("@momentum/db", () => ({
  tasks: { complete: completeMock, uncomplete: uncompleteMock, update: updateMock },
  blocks: {},
}));

vi.mock("@/lib/auth/session", () => ({
  requireSession: () =>
    Promise.resolve({
      supabase: {},
      userId: "u",
      email: null,
      profile: { timezone: "America/New_York" },
    }),
}));

const { bulkSetCompletion, reorderTask } = await import("@/features/tasks/actions");

const IDS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];

function completed(id: string): Task {
  return {
    id,
    userId: "u",
    projectId: null,
    parentTaskId: null,
    title: "Problem set 4",
    description: null,
    status: "completed",
    priority: 4,
    estimatedMinutes: null,
    actualMinutes: 0,
    dueDate: localDate("2026-09-11"),
    completedAt: instant("2026-09-07T15:00:00.000Z"),
    archivedAt: null,
    sortOrder: 0,
    createdAt: instant("2026-09-01T00:00:00.000Z"),
    updatedAt: instant("2026-09-07T15:00:00.000Z"),
  };
}

// What PostgREST passes through when `complete_task` cannot find the row.
const GONE = { code: "P0002", message: "task not found" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("bulkSetCompletion", () => {
  it("completes every selected task and revalidates the surfaces they appear on", async () => {
    completeMock.mockImplementation((_client: unknown, id: string) =>
      Promise.resolve(completed(id)),
    );

    const result = await bulkSetCompletion({ ids: IDS, completed: true });

    expect(result.ok).toBe(true);
    expect(completeMock).toHaveBeenCalledTimes(3);
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/calendar");
    expect(revalidatePathMock).toHaveBeenCalledWith("/today");
  });

  it("still revalidates the tasks that committed when one of them is refused", async () => {
    completeMock.mockImplementation((_client: unknown, id: string) =>
      id === IDS[1] ? Promise.reject(GONE) : Promise.resolve(completed(id)),
    );

    const result = await bulkSetCompletion({ ids: IDS, completed: true });

    // The other two rows really are complete, so the client must be told.
    expect(result).toEqual({
      ok: false,
      error: { code: "not_found", message: "That task no longer exists." },
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("revalidates nothing when every call is refused", async () => {
    completeMock.mockRejectedValue(GONE);

    const result = await bulkSetCompletion({ ids: IDS, completed: true });

    expect(result.ok).toBe(false);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("issues one call per id and does not stop at the first refusal", async () => {
    uncompleteMock.mockImplementation((_client: unknown, id: string) =>
      id === IDS[0] ? Promise.reject(GONE) : Promise.resolve(completed(id)),
    );

    await bulkSetCompletion({ ids: IDS, completed: false });

    expect(uncompleteMock).toHaveBeenCalledTimes(3);
  });

  it("rejects a malformed selection before touching the database", async () => {
    const result = await bulkSetCompletion({ ids: ["not-a-uuid"], completed: true });

    expect(result.ok).toBe(false);
    expect(completeMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});

describe("reorderTask", () => {
  it("writes every row in the batch with its own number", async () => {
    updateMock.mockImplementation((_client: unknown, id: string, patch: { sortOrder: number }) =>
      Promise.resolve({ ...completed(id), status: "open", sortOrder: patch.sortOrder }),
    );

    const result = await reorderTask({
      orders: [
        { id: IDS[0], sortOrder: -2 },
        { id: IDS[1], sortOrder: 2 },
      ],
    });

    expect(result.ok).toBe(true);
    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(updateMock).toHaveBeenCalledWith(expect.anything(), IDS[0], { sortOrder: -2 });
    expect(updateMock).toHaveBeenCalledWith(expect.anything(), IDS[1], { sortOrder: 2 });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an empty batch, and a number that is not a position", async () => {
    expect((await reorderTask({ orders: [] })).ok).toBe(false);
    expect((await reorderTask({ orders: [{ id: IDS[0], sortOrder: Infinity }] })).ok).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
