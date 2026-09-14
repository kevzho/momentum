import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Checkbox } from "@momentum/ui/components/checkbox";

/** Round means done, square means selected; the two sit side by side in the task list. */
describe("Checkbox", () => {
  it("is square by default", () => {
    render(<Checkbox aria-label="Select" />);
    const box = screen.getByRole("checkbox");
    expect(box.getAttribute("data-shape")).toBe("square");
    expect(box.classList.contains("rounded-sm")).toBe(true);
    expect(box.classList.contains("rounded-full")).toBe(false);
  });

  it("is a circle when shape is round", () => {
    render(<Checkbox shape="round" aria-label="Complete" />);
    const box = screen.getByRole("checkbox");
    expect(box.getAttribute("data-shape")).toBe("round");
    expect(box.classList.contains("rounded-full")).toBe(true);
    expect(box.classList.contains("rounded-sm")).toBe(false);
  });

  it("keeps aria and checked behaviour the same in both shapes", () => {
    for (const shape of ["square", "round"] as const) {
      const onCheckedChange = vi.fn();
      const { unmount } = render(
        <Checkbox
          shape={shape}
          checked={false}
          onCheckedChange={onCheckedChange}
          aria-label={`Complete ${shape}`}
        />,
      );
      const box = screen.getByRole("checkbox", { name: `Complete ${shape}` });
      expect(box.getAttribute("aria-checked")).toBe("false");
      expect(box.getAttribute("data-state")).toBe("unchecked");

      fireEvent.click(box);
      expect(onCheckedChange).toHaveBeenCalledWith(true);
      unmount();
    }
  });

  it("reflects a checked value in aria and data-state", () => {
    render(<Checkbox shape="round" checked aria-label="Done" />);
    const box = screen.getByRole("checkbox");
    expect(box.getAttribute("aria-checked")).toBe("true");
    expect(box.getAttribute("data-state")).toBe("checked");
  });
});
