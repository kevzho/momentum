import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TaskRow } from "@momentum/ui/components/task-row";

describe("TaskRow", () => {
  it("names priority in text, never by colour alone", () => {
    render(<TaskRow title="Draft literature review" priority={1} />);
    expect(screen.getByText("Priority 1")).toBeDefined();
  });

  it("shows nothing for priority 4, which means no priority set", () => {
    render(<TaskRow title="Renew library loans" priority={4} />);
    expect(screen.queryByText(/^Priority/)).toBeNull();
    expect(screen.queryByText("No priority")).toBeNull();
  });

  it("gives the checkbox an accessible name that reflects the action", () => {
    const { rerender } = render(<TaskRow title="Problem set 4" />);
    expect(screen.getByRole("checkbox").getAttribute("aria-label")).toBe(
      'Complete "Problem set 4"',
    );

    rerender(<TaskRow title="Problem set 4" completed />);
    expect(screen.getByRole("checkbox").getAttribute("aria-label")).toBe(
      'Mark "Problem set 4" as open',
    );
  });
});
