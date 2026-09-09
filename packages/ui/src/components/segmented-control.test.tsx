import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as React from "react";

import { SegmentedControl } from "@momentum/ui/components/segmented-control";

const OPTIONS = [
  { value: "7", label: "7d", ariaLabel: "Last 7 days" },
  { value: "30", label: "30d", ariaLabel: "Last 30 days" },
  { value: "90", label: "90d", ariaLabel: "Last 90 days" },
];

function Harness({ onValueChange }: { onValueChange?: (value: string) => void }) {
  const [value, setValue] = React.useState("30");
  return (
    <SegmentedControl
      label="Time window"
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
      options={OPTIONS}
    />
  );
}

describe("SegmentedControl", () => {
  it("is a radiogroup whose arrow keys move the selection with the focus", async () => {
    const onValueChange = vi.fn();
    render(<Harness onValueChange={onValueChange} />);

    const group = screen.getByRole("radiogroup", { name: "Time window" });
    const thirty = screen.getByRole("radio", { name: "Last 30 days" });
    const ninety = screen.getByRole("radio", { name: "Last 90 days" });
    expect(group).toBeDefined();
    expect(thirty.getAttribute("aria-checked")).toBe("true");

    thirty.focus();
    expect(onValueChange).not.toHaveBeenCalled();
    fireEvent.keyDown(thirty, { key: "ArrowRight" });

    // Radix moves the roving tabstop a tick later; the selection must follow it.
    await waitFor(() => expect(document.activeElement).toBe(ninety));
    expect(onValueChange).toHaveBeenCalledWith("90");
    expect(ninety.getAttribute("aria-checked")).toBe("true");
    expect(thirty.getAttribute("aria-checked")).toBe("false");
  });

  it("selects on Home and End too, and never deselects", async () => {
    const onValueChange = vi.fn();
    render(<Harness onValueChange={onValueChange} />);

    const thirty = screen.getByRole("radio", { name: "Last 30 days" });
    thirty.focus();
    fireEvent.keyDown(thirty, { key: "Home" });
    await waitFor(() => expect(onValueChange).toHaveBeenLastCalledWith("7"));
    fireEvent.keyDown(screen.getByRole("radio", { name: "Last 7 days" }), { key: "End" });
    await waitFor(() => expect(onValueChange).toHaveBeenLastCalledWith("90"));

    // Clicking the selected option again is a no-op, not an empty selection.
    fireEvent.click(screen.getByRole("radio", { name: "Last 90 days" }));
    expect(onValueChange).not.toHaveBeenCalledWith("");
    expect(screen.getByRole("radio", { name: "Last 90 days" }).getAttribute("aria-checked")).toBe(
      "true",
    );
  });
});
