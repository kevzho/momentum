import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Project } from "@momentum/core/types";

import type { ProjectSummary, ProjectSummaryWithCount } from "@/features/tasks/types";

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
const { useProjectManager } = await import("@/features/projects/components/project-manager");
const { TooltipProvider } = await import("@momentum/ui/components/tooltip");

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

// The header's icon button, or with nothing listed the row that stands in for it.
const newProject = () => screen.getByRole("button", { name: "New project" });

function createsAsAsked() {
  createProjectMock.mockImplementation((input: { id: string; name: string; color: string }) =>
    Promise.resolve(saved({ id: input.id, name: input.name, color: input.color })),
  );
}

async function fillAndSubmit(name: string, color?: string) {
  const dialog = await screen.findByRole("dialog", { name: "New project" });
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: name } });
  if (color !== undefined) fireEvent.click(screen.getByRole("radio", { name: color }));
  fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

describe("creating a project", () => {
  it("opens the dialog from the list header and creates with a client-generated id", async () => {
    createsAsAsked();
    render(<SidebarNav projects={[THESIS]} />);

    const opener = newProject();
    opener.focus();
    fireEvent.click(opener);
    await fillAndSubmit("FIX-Reading", "Teal");

    expect(createProjectMock).toHaveBeenCalledTimes(1);
    const input = createProjectMock.mock.calls[0]?.[0] as {
      id: string;
      name: string;
      color: string;
    };
    expect(input.id).toMatch(UUID);
    expect(input.name).toBe("FIX-Reading");
    expect(input.color).toBe("teal");

    // Listed at once, before the layout's refresh returns it, with nothing counted.
    const row = screen.getByRole("link", { name: /FIX-Reading/ });
    expect(row.textContent).toBe("FIX-Reading0");
    expect(document.activeElement).toBe(opener);
  });

  it("creates from the empty list's row and keeps focus in the rail once the row has gone", async () => {
    createsAsAsked();
    const { rerender } = render(<SidebarNav projects={[]} />);

    const row = newProject();
    row.focus();
    fireEvent.click(row);
    await fillAndSubmit("FIX-Reading");

    // The new project takes the row's place in the same commit, so the
    // dialog's restore falls through to the row's neighbour.
    expect(row.isConnected).toBe(false);
    expect(screen.getByRole("link", { name: /FIX-Reading/ })).toBeDefined();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "New task" }));

    const id = (createProjectMock.mock.calls[0]?.[0] as { id: string }).id;
    rerender(<SidebarNav projects={[{ id, name: "FIX-Reading", color: "blue", openTasks: 0 }]} />);
    expect(screen.getAllByRole("link", { name: /FIX-Reading/ })).toHaveLength(1);
    expect(document.activeElement).not.toBe(document.body);
  });

  it("keeps the dialog open with the message when the server refuses", async () => {
    createProjectMock.mockResolvedValue({
      ok: false,
      error: { code: "unavailable", message: "Momentum could not save that change." },
    });
    render(<SidebarNav projects={[]} />);

    fireEvent.click(newProject());
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

  it("offers one New project row in place of an empty list, which opens the same dialog", async () => {
    render(<SidebarNav projects={[]} />);

    expect(screen.queryByText("No projects yet.")).toBeNull();
    // The header's icon button steps aside: two controls with one name is one too many.
    expect(screen.getAllByRole("button", { name: "New project" })).toHaveLength(1);
    const row = newProject();
    expect(row.textContent).toBe("New project");
    // Same shape as the New task row beneath it.
    expect(row.className).toBe(screen.getByRole("button", { name: "New task" }).className);

    row.focus();
    fireEvent.click(row);
    await screen.findByRole("dialog", { name: "New project" });

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(row);
  });

  it("keeps the header button when there are projects, or when the rail is collapsed", () => {
    const newTask = () => screen.getByRole("button", { name: "New task" }).className;
    const { rerender } = render(
      <TooltipProvider>
        <SidebarNav projects={[THESIS]} />
      </TooltipProvider>,
    );
    expect(screen.getAllByRole("button", { name: "New project" })).toHaveLength(1);
    expect(newProject().className).not.toBe(newTask());

    rerender(
      <TooltipProvider>
        <SidebarNav collapsed projects={[]} />
      </TooltipProvider>,
    );
    expect(screen.getAllByRole("button", { name: "New project" })).toHaveLength(1);
    expect(newProject().className).not.toBe(newTask());
  });
});

describe("the manager's own list", () => {
  function Harness({
    projects,
    onCreated,
    onCreatedOnce,
  }: {
    projects: readonly ProjectSummary[];
    onCreated: (project: Project) => void;
    onCreatedOnce?: (project: Project) => void;
  }) {
    const manager = useProjectManager({ projects, onCreated });
    return (
      <>
        <ul aria-label="Known projects">
          {manager.projects.map((project) => (
            <li key={project.id}>{project.name}</li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() =>
            manager.createProject(
              onCreatedOnce === undefined ? undefined : { onCreated: onCreatedOnce },
            )
          }
        >
          Open
        </button>
        {manager.dialogs}
      </>
    );
  }

  const listed = () =>
    [...screen.getByRole("list", { name: "Known projects" }).querySelectorAll("li")].map(
      (item) => item.textContent,
    );

  async function create(name: string) {
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const dialog = await screen.findByRole("dialog", { name: "New project" });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: name } });
    fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  }

  beforeEach(() => {
    createProjectMock.mockImplementation((input: { id: string; name: string; color: string }) =>
      Promise.resolve(saved({ id: input.id, name: input.name, color: input.color })),
    );
  });

  it("lists what it created until the server's list holds it, then defers to that", async () => {
    const { rerender } = render(<Harness projects={[THESIS]} onCreated={vi.fn()} />);
    expect(listed()).toEqual(["FIX-Thesis"]);

    await create("FIX-Reading");
    expect(listed()).toEqual(["FIX-Thesis", "FIX-Reading"]);

    // The server's list arrives with the new project, renamed by someone else meanwhile.
    const id = (createProjectMock.mock.calls[0]?.[0] as { id: string }).id;
    rerender(
      <Harness
        projects={[THESIS, { id, name: "FIX-Reading list", color: "blue" }]}
        onCreated={vi.fn()}
      />,
    );
    expect(listed()).toEqual(["FIX-Thesis", "FIX-Reading list"]);

    // Archived since: the server's list drops it, and it stays dropped.
    rerender(<Harness projects={[THESIS]} onCreated={vi.fn()} />);
    expect(listed()).toEqual(["FIX-Thesis"]);
  });

  it("still answers a per-call onCreated after a Retry", async () => {
    createProjectMock.mockResolvedValueOnce({
      ok: false,
      error: { code: "unavailable", message: "Momentum could not save that change." },
    });
    const hookLevel = vi.fn();
    const once = vi.fn();
    render(<Harness projects={[]} onCreated={hookLevel} onCreatedOnce={once} />);

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const dialog = await screen.findByRole("dialog", { name: "New project" });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "FIX-Reading" } });
    fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);

    const retry = await screen.findByRole("button", { name: "Retry" });
    await waitFor(() => expect(retry.getAttribute("aria-disabled")).toBeNull());
    fireEvent.click(retry);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expect(createProjectMock).toHaveBeenCalledTimes(2);
    expect(once).toHaveBeenCalledTimes(1);
    expect(hookLevel).not.toHaveBeenCalled();
  });

  it("lets a per-call onCreated stand in for the hook's, for that opening only", async () => {
    const hookLevel = vi.fn();
    const once = vi.fn();
    const { rerender } = render(
      <Harness projects={[]} onCreated={hookLevel} onCreatedOnce={once} />,
    );

    await create("FIX-Reading");
    expect(once).toHaveBeenCalledTimes(1);
    expect(once.mock.calls[0]?.[0]).toMatchObject({ name: "FIX-Reading" });
    expect(hookLevel).not.toHaveBeenCalled();

    rerender(<Harness projects={[]} onCreated={hookLevel} />);
    await create("FIX-Writing");
    expect(hookLevel).toHaveBeenCalledTimes(1);
    expect(hookLevel.mock.calls[0]?.[0]).toMatchObject({ name: "FIX-Writing" });
    expect(once).toHaveBeenCalledTimes(1);
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
    expect(document.activeElement).toBe(newProject());
  });
});
