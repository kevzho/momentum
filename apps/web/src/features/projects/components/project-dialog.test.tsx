import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ProjectDialog,
  type ProjectDialogProps,
} from "@/features/projects/components/project-dialog";

function props(overrides: Partial<ProjectDialogProps> = {}): ProjectDialogProps {
  return {
    open: true,
    project: null,
    pending: false,
    error: null,
    onSubmit: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

const radios = () => screen.getAllByRole("radio");
const checked = () =>
  radios()
    .find((radio) => radio.getAttribute("aria-checked") === "true")
    ?.getAttribute("aria-label");

describe("ProjectDialog", () => {
  it("submits the trimmed name and the chosen colour", async () => {
    const onSubmit = vi.fn();
    render(<ProjectDialog {...props({ onSubmit })} />);

    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "  FIX-Thesis " } });
    fireEvent.click(screen.getByRole("radio", { name: "Teal" }));
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    expect(onSubmit).toHaveBeenCalledWith({ name: "FIX-Thesis", color: "teal" });
  });

  it("refuses an empty name without calling out", async () => {
    const onSubmit = vi.fn();
    render(<ProjectDialog {...props({ onSubmit })} />);

    await screen.findByLabelText("Name");
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("moves the colour with the arrow keys, one tab stop for the whole group", async () => {
    render(<ProjectDialog {...props()} />);
    await screen.findByRole("radiogroup", { name: "Colour" });

    // Only the chosen swatch is in the tab order.
    expect(radios().filter((radio) => radio.tabIndex === 0)).toHaveLength(1);
    expect(checked()).toBe("Blue");

    const blue = screen.getByRole("radio", { name: "Blue" });
    blue.focus();
    fireEvent.keyDown(blue, { key: "ArrowRight" });
    expect(checked()).toBe("Indigo");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Indigo" }));

    fireEvent.keyDown(document.activeElement as Element, { key: "Home" });
    expect(checked()).toBe("Slate");
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowLeft" });
    expect(checked()).toBe("Rose");
  });

  it("starts a rename from the project's own values", async () => {
    render(
      <ProjectDialog {...props({ project: { id: "p1", name: "FIX-Thesis", color: "rose" } })} />,
    );

    expect(await screen.findByRole("dialog", { name: "Rename project" })).toBeDefined();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("FIX-Thesis");
    expect(checked()).toBe("Rose");
  });

  it("shows the server's field message on the field and a general one with Retry", async () => {
    const retry = vi.fn();
    const { rerender } = render(
      <ProjectDialog
        {...props({
          error: {
            code: "validation",
            message: "Names are at most 100 characters.",
            fieldErrors: { name: ["Names are at most 100 characters."] },
          },
        })}
      />,
    );

    const field = await screen.findByLabelText("Name");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toBe("Names are at most 100 characters.");
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();

    rerender(
      <ProjectDialog
        {...props({ error: { code: "unavailable", message: "Could not reach.", retry } })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("returns focus to the opener on close", async () => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            New project
          </button>
          <ProjectDialog {...props({ open, onClose: () => setOpen(false) })} />
        </>
      );
    }
    render(<Harness />);

    const opener = screen.getByRole("button", { name: "New project" });
    opener.focus();
    fireEvent.click(opener);
    await screen.findByRole("dialog");
    await waitFor(() => expect(document.activeElement).not.toBe(opener));

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(opener);
  });
});
