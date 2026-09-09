import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectSummaryWithCount } from "@/features/tasks/types";

const { createProjectMock, updateProjectMock, archiveProjectMock, successToast, errorToast } =
  vi.hoisted(() => ({
    createProjectMock: vi.fn(),
    updateProjectMock: vi.fn(),
    archiveProjectMock: vi.fn(),
    successToast: vi.fn(),
    errorToast: vi.fn(),
  }));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/today",
}));

vi.mock("@momentum/ui/components/toast", () => ({
  toast: { success: successToast, error: errorToast, info: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/features/tasks/actions", () => ({ createTask: vi.fn() }));
vi.mock("@/features/projects/actions", () => ({
  createProject: createProjectMock,
  updateProject: updateProjectMock,
  archiveProject: archiveProjectMock,
}));

const { SidebarNav } = await import("@/components/sidebar-nav");

const THESIS: ProjectSummaryWithCount = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "FIX-Thesis",
  color: "teal",
  openTasks: 3,
};
const EMPTY: ProjectSummaryWithCount = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "FIX-Empty",
  color: "slate",
  openTasks: 0,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function saved(overrides: Record<string, unknown>) {
  return { ok: true as const, data: { ...THESIS, ...overrides } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

async function openMenu(name: string) {
  const trigger = screen.getByRole("button", { name: `Options for ${name}` });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
  return screen.findByRole("menu");
}

describe("creating a project", () => {
  it("opens the dialog from the list header and creates with a client-generated id", async () => {
    createProjectMock.mockImplementation((input: { id: string; name: string; color: string }) =>
      Promise.resolve(saved({ id: input.id, name: input.name, color: input.color })),
    );
    render(<SidebarNav projects={[]} />);

    const opener = screen.getByRole("button", { name: "New project" });
    opener.focus();
    fireEvent.click(opener);

    const dialog = await screen.findByRole("dialog", { name: "New project" });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "FIX-Thesis" } });
    fireEvent.click(screen.getByRole("radio", { name: "Teal" }));
    fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(createProjectMock).toHaveBeenCalledTimes(1));
    const input = createProjectMock.mock.calls[0]?.[0] as {
      id: string;
      name: string;
      color: string;
    };
    expect(input.id).toMatch(UUID);
    expect(input.name).toBe("FIX-Thesis");
    expect(input.color).toBe("teal");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(opener);
  });

  it("keeps the dialog open with the message when the server refuses", async () => {
    createProjectMock.mockResolvedValue({
      ok: false,
      error: { code: "unavailable", message: "Momentum could not save that change." },
    });
    render(<SidebarNav projects={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "New project" }));
    const dialog = await screen.findByRole("dialog", { name: "New project" });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "FIX-Thesis" } });
    fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Momentum could not save that change.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
    expect(screen.getByRole("dialog")).toBeDefined();

    // Retry is inert until the failed write has settled.
    const retry = screen.getByRole("button", { name: "Retry" });
    await waitFor(() => expect(retry.getAttribute("aria-disabled")).toBeNull());
    fireEvent.click(retry);
    await waitFor(() => expect(createProjectMock).toHaveBeenCalledTimes(2));
    expect(createProjectMock.mock.calls[1]?.[0]).toEqual(createProjectMock.mock.calls[0]?.[0]);
  });
});

describe("a project's menu", () => {
  it("renames through the same dialog, seeded with the project", async () => {
    updateProjectMock.mockResolvedValue(saved({ name: "FIX-Dissertation" }));
    render(<SidebarNav projects={[THESIS]} />);

    const menu = await openMenu("FIX-Thesis");
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    await waitFor(() => expect(menu.isConnected).toBe(false));

    const dialog = await screen.findByRole("dialog", { name: "Rename project" });
    const name = screen.getByLabelText("Name") as HTMLInputElement;
    expect(name.value).toBe("FIX-Thesis");
    fireEvent.change(name, { target: { value: "FIX-Dissertation" } });
    fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);

    await waitFor(() =>
      expect(updateProjectMock).toHaveBeenCalledWith({
        id: THESIS.id,
        name: "FIX-Dissertation",
        color: "teal",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Options for FIX-Thesis" }),
    );
  });

  it("asks before archiving a project with open tasks, and says how many", async () => {
    archiveProjectMock.mockResolvedValue(saved({ archivedAt: "2026-09-09T12:00:00.000Z" }));
    render(<SidebarNav projects={[THESIS]} />);

    await openMenu("FIX-Thesis");
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));

    const confirm = await screen.findByRole("dialog", { name: "Archive “FIX-Thesis”?" });
    expect(confirm.textContent).toContain("Its 3 open tasks keep the project");
    expect(archiveProjectMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() =>
      expect(archiveProjectMock).toHaveBeenCalledWith({ id: THESIS.id, archived: true }),
    );
    await waitFor(() => expect(successToast).toHaveBeenCalledWith("Archived “FIX-Thesis”"));
  });

  it("archives an empty project straight away", async () => {
    archiveProjectMock.mockResolvedValue(saved({ ...EMPTY }));
    render(<SidebarNav projects={[EMPTY]} />);

    await openMenu("FIX-Empty");
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));

    await waitFor(() =>
      expect(archiveProjectMock).toHaveBeenCalledWith({ id: EMPTY.id, archived: true }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers Retry on a toast when archiving fails", async () => {
    archiveProjectMock.mockResolvedValue({
      ok: false,
      error: { code: "unavailable", message: "Could not reach." },
    });
    render(<SidebarNav projects={[EMPTY]} />);

    await openMenu("FIX-Empty");
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));

    await waitFor(() => expect(errorToast).toHaveBeenCalledTimes(1));
    const [message, options] = errorToast.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(message).toBe("Could not reach.");
    expect(options.action.label).toBe("Retry");
  });

  it("hands focus to New project when the archived row has left the list", async () => {
    archiveProjectMock.mockResolvedValue(saved({ ...EMPTY }));
    const { rerender } = render(<SidebarNav projects={[EMPTY]} />);

    await openMenu("FIX-Empty");
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    await waitFor(() => expect(successToast).toHaveBeenCalled());

    // The layout re-renders without the row; the menu's trigger unmounts.
    rerender(<SidebarNav projects={[]} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "New project" }));
  });
});
