import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProjectSelect } from "@/features/projects/components/project-select";
import type { ProjectSummary } from "@/features/tasks/types";

const SCHOOL: ProjectSummary = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "School",
  color: "blue",
};
const WORK: ProjectSummary = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Work",
  color: "teal",
};

function renderSelect(value: string | null = SCHOOL.id) {
  const onValueChange = vi.fn();
  const onCreate = vi.fn();
  render(
    <ProjectSelect
      value={value}
      projects={[SCHOOL, WORK]}
      onValueChange={onValueChange}
      onCreate={onCreate}
    />,
  );
  return { onValueChange, onCreate };
}

const trigger = () => screen.getByRole("combobox", { name: "Project" });

async function open() {
  fireEvent.click(trigger());
  return screen.findByRole("listbox");
}

describe("ProjectSelect", () => {
  it("lists no project, every project and a way to create one", async () => {
    renderSelect();
    await open();

    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "No project",
      "School",
      "Work",
      "New project…",
    ]);
  });

  it("reports the chosen project's id, and null for no project", async () => {
    const { onValueChange } = renderSelect();

    await open();
    fireEvent.click(screen.getByRole("option", { name: "Work" }));
    expect(onValueChange).toHaveBeenCalledWith(WORK.id);

    await open();
    fireEvent.click(screen.getByRole("option", { name: "No project" }));
    expect(onValueChange).toHaveBeenLastCalledWith(null);
  });

  it("opens creation from the trigger, without touching the value", async () => {
    const { onValueChange, onCreate } = renderSelect();
    let focusedWhenAsked: Element | null = null;
    onCreate.mockImplementation(() => {
      focusedWhenAsked = document.activeElement;
    });

    await open();
    fireEvent.click(screen.getByRole("option", { name: "New project…" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onValueChange).not.toHaveBeenCalled();
    expect(trigger().textContent).toContain("School");
    // The dialog about to open records the active element as its opener.
    expect(focusedWhenAsked).toBe(trigger());
  });

  it("opens creation from the closed trigger's typeahead, and only then", async () => {
    const { onValueChange, onCreate } = renderSelect(null);

    // "n" from "No project" lands on "New project…" without opening the list.
    trigger().focus();
    fireEvent.keyDown(trigger(), { key: "n" });
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();

    // The next pick from the open list is just a pick.
    await open();
    fireEvent.click(screen.getByRole("option", { name: "Work" }));
    expect(onValueChange).toHaveBeenCalledWith(WORK.id);
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});
