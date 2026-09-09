import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DurationInput } from "@momentum/ui/components/duration-input";

describe("DurationInput", () => {
  it("clears aria-invalid when blur reverts an unreadable draft to the committed value", () => {
    const onValueChange = vi.fn();
    render(<DurationInput aria-label="Estimate" value={90} onValueChange={onValueChange} />);

    const input = screen.getByRole("textbox", { name: "Estimate" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(onValueChange).not.toHaveBeenCalled();

    fireEvent.blur(input, { target: { value: "abc" } });

    // A field showing a valid value must not go on saying it is invalid.
    expect(input.getAttribute("value")).toBe("1h 30m");
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("commits a readable value on blur", () => {
    const onValueChange = vi.fn();
    render(<DurationInput aria-label="Estimate" value={null} onValueChange={onValueChange} />);

    const input = screen.getByRole("textbox", { name: "Estimate" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "45m" } });
    fireEvent.blur(input, { target: { value: "45m" } });
    expect(onValueChange).toHaveBeenCalledWith(45);
    expect(input.hasAttribute("aria-invalid")).toBe(false);
  });
});
