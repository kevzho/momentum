import { beforeEach, describe, expect, it, vi } from "vitest";

import { instant } from "@momentum/core/time";
import type { Project } from "@momentum/core/types";

const { insertMock, findByIdMock, updateMock, setArchivedMock, refreshMock } = vi.hoisted(() => ({
  insertMock: vi.fn(),
  findByIdMock: vi.fn(),
  updateMock: vi.fn(),
  setArchivedMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ refresh: refreshMock, revalidatePath: vi.fn() }));

vi.mock("@momentum/db", () => ({
  projects: {
    insert: insertMock,
    findById: findByIdMock,
    update: updateMock,
    setArchived: setArchivedMock,
  },
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

const { archiveProject, createProject, updateProject } =
  await import("@/features/projects/actions");

const ID = "11111111-1111-4111-8111-111111111111";

const PROJECT: Project = {
  id: ID,
  userId: "u",
  name: "FIX-Thesis",
  description: null,
  color: "teal",
  icon: null,
  archivedAt: null,
  createdAt: instant("2026-09-01T00:00:00.000Z"),
  updatedAt: instant("2026-09-01T00:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createProject", () => {
  it("inserts with the client's id and re-renders the route", async () => {
    insertMock.mockResolvedValue(PROJECT);

    const result = await createProject({ id: ID, name: "  FIX-Thesis ", color: "teal" });

    expect(result).toEqual({ ok: true, data: PROJECT });
    expect(insertMock).toHaveBeenCalledWith(
      {},
      { id: ID, userId: "u", name: "FIX-Thesis", color: "teal" },
    );
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("treats a retry that collides with its own row as success", async () => {
    insertMock.mockRejectedValue({ code: "23505", message: "duplicate key" });
    findByIdMock.mockResolvedValue(PROJECT);

    const result = await createProject({ id: ID, name: "FIX-Thesis", color: "teal" });

    expect(result).toEqual({ ok: true, data: PROJECT });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("refuses an empty name and an unknown colour on the field, without a write", async () => {
    const blank = await createProject({ id: ID, name: "   ", color: "teal" });
    expect(blank.ok).toBe(false);
    if (!blank.ok) {
      expect(blank.error.code).toBe("validation");
      expect(blank.error.fieldErrors?.name).toEqual(["Give the project a name."]);
    }

    const hue = await createProject({ id: ID, name: "FIX-Thesis", color: "chartreuse" });
    expect(hue.ok).toBe(false);
    if (!hue.ok) expect(hue.error.fieldErrors?.color).toBeDefined();

    expect(insertMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});

describe("updateProject", () => {
  it("writes the name and colour together", async () => {
    updateMock.mockResolvedValue({ ...PROJECT, name: "FIX-Dissertation", color: "rose" });

    const result = await updateProject({ id: ID, name: "FIX-Dissertation", color: "rose" });

    expect(result.ok).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({}, ID, { name: "FIX-Dissertation", color: "rose" });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});

describe("archiveProject", () => {
  it("sets the flag on the project and touches no task", async () => {
    setArchivedMock.mockResolvedValue({
      ...PROJECT,
      archivedAt: instant("2026-09-09T12:00:00.000Z"),
    });

    const result = await archiveProject({ id: ID, archived: true });

    expect(result.ok).toBe(true);
    expect(setArchivedMock).toHaveBeenCalledWith({}, ID, true);
    expect(updateMock).not.toHaveBeenCalled();
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("reports a row it cannot find without re-rendering", async () => {
    setArchivedMock.mockRejectedValue({ code: "PGRST116", message: "0 rows" });

    const result = await archiveProject({ id: ID, archived: true });

    expect(result).toEqual({
      ok: false,
      error: { code: "not_found", message: "That project no longer exists." },
    });
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
