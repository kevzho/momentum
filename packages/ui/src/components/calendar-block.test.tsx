import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CalendarBlock } from "@momentum/ui/components/calendar-block";

/**
 * Domain Rule: block kinds must be distinguishable without colour. Each kind
 * carries its own outline treatment and its own accessible name.
 */
describe("CalendarBlock", () => {
  it("names the kind for assistive technology", () => {
    render(<CalendarBlock kind="work" title="Literature review" />);
    expect(screen.getByText("Work block")).toBeDefined();
  });

  it("distinguishes kinds by shape as well as colour", () => {
    const { container: event } = render(<CalendarBlock kind="event" title="Lecture" />);
    const { container: habit } = render(<CalendarBlock kind="habit" title="Run" />);
    expect(event.firstElementChild?.className).toContain("border-l-[3px]");
    expect(habit.firstElementChild?.className).toContain("border-dashed");
  });

  it("marks a completed block as completed rather than hiding it", () => {
    render(<CalendarBlock kind="event" title="Lecture" completed />);
    expect(screen.getByText(/completed/)).toBeDefined();
  });

  /**
   * Domain Rule 13: an unexecuted block of a completed task stays on the
   * calendar. It has to read as settled without reading as executed, so it is
   * de-emphasised but never struck through.
   */
  it("marks a block whose task is complete as settled, not as completed", () => {
    const { container } = render(<CalendarBlock kind="work" title="Essay" settled />);
    const block = container.firstElementChild;
    expect(block?.getAttribute("data-settled")).toBe("true");
    expect(block?.getAttribute("data-completed")).toBeNull();
    expect(screen.getByText(/task completed/)).toBeDefined();
    expect(container.querySelector(".line-through")).toBeNull();
  });

  it("lets a completed block outrank the settled treatment", () => {
    const { container } = render(<CalendarBlock kind="work" title="Essay" settled completed />);
    expect(container.firstElementChild?.getAttribute("data-settled")).toBeNull();
    expect(container.querySelector(".line-through")).not.toBeNull();
  });

  it("gives the glyph slot to a control when the block carries one", () => {
    render(
      <CalendarBlock
        kind="work"
        title="Essay"
        control={<button type="button">Done with this block</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Done with this block" })).toBeDefined();
  });

  it("announces a block that was cut in two by midnight", () => {
    render(<CalendarBlock kind="event" title="Night shift" continuesBefore />);
    expect(screen.getByText(/continued from the previous day/)).toBeDefined();
  });

  it("keeps the time on a block too short to show a second line", () => {
    render(<CalendarBlock kind="event" title="Standup" timeLabel="09:00 – 09:15" compact />);
    // Not rendered as the visible second line, but still in the block's text.
    expect(screen.getByText(/09:00 – 09:15/)).toBeDefined();
  });
});
