import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { HabitCard, type HabitCardDay } from "@momentum/ui/components/habit-card";
import { HabitHeatmap } from "@momentum/ui/components/habit-heatmap";

function day(overrides: Partial<HabitCardDay> = {}): HabitCardDay {
  return {
    key: "2026-09-07",
    short: "M",
    state: "met",
    label: "Monday, September 7, 2026: done",
    ...overrides,
  };
}

describe("HabitCard", () => {
  it("names every day's state in text, never by colour alone", () => {
    render(
      <HabitCard
        name="Gym"
        target="Mon · Wed · Fri"
        consistency="86%"
        xpReward={8}
        week={[
          day({ key: "a", state: "met", label: "Monday: done" }),
          day({ key: "b", state: "open", label: "Tuesday: not recorded" }),
          day({ key: "c", state: "ahead", label: "Wednesday: coming up" }),
          day({ key: "d", state: "partial", label: "Thursday: some" }),
          day({ key: "e", state: "free", label: "Friday: not scheduled" }),
        ]}
      />,
    );

    for (const label of [
      "Monday: done",
      "Tuesday: not recorded",
      "Wednesday: coming up",
      "Thursday: some",
      "Friday: not scheduled",
    ]) {
      expect(screen.getByText(label)).toBeDefined();
    }
  });

  it("draws the five states with different shapes, not only different fills", () => {
    const { container } = render(
      <HabitCard
        name="Gym"
        target="Every day"
        consistency="—"
        xpReward={5}
        week={[
          day({ key: "a", state: "met" }),
          day({ key: "b", state: "open" }),
          day({ key: "c", state: "ahead" }),
        ]}
      />,
    );

    const cells = container.querySelectorAll("[data-slot=habit-day]");
    expect(cells[0]?.querySelector("svg path")).not.toBeNull();
    expect(cells[1]?.className).not.toContain("border-dashed");
    expect(cells[2]?.className).toContain("border-dashed");
  });

  it("renders a static cell when the day cannot be recorded from here", () => {
    render(
      <HabitCard
        name="Gym"
        target="Every day"
        consistency="—"
        xpReward={5}
        week={[day({ key: "a" })]}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("makes a recordable day a real button that reports its pressed state", async () => {
    const onSelect = vi.fn();
    render(
      <HabitCard
        name="Gym"
        target="Every day"
        consistency="—"
        xpReward={5}
        week={[day({ key: "a", state: "met", onSelect })]}
      />,
    );

    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    button.click();
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("uses aria-disabled rather than disabled, so a keyboard user keeps focus", () => {
    render(
      <HabitCard
        name="Gym"
        target="Every day"
        consistency="—"
        xpReward={5}
        week={[day({ key: "a", onSelect: vi.fn(), disabled: true })]}
      />,
    );

    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(false);
  });

  it("ignores a press on a day that says it is disabled", () => {
    const onSelect = vi.fn();
    render(
      <HabitCard
        name="Gym"
        target="Every day"
        consistency="—"
        xpReward={5}
        week={[day({ key: "a", state: "open", onSelect, disabled: true })]}
      />,
    );

    // A button's activation is a click whichever key fired it, so this covers Enter and Space.
    const button = screen.getByRole("button");
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.keyDown(button, { key: " " });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("keeps the 20px ring inside a cell box that can grow on a coarse pointer", () => {
    const { container } = render(
      <HabitCard
        name="Gym"
        target="Every day"
        consistency="—"
        xpReward={5}
        week={[day({ key: "a", onSelect: vi.fn() }), day({ key: "b" })]}
      />,
    );

    for (const box of container.querySelectorAll("li > *")) {
      expect(box.className).toContain("pointer-coarse:size-10");
      expect(box.querySelector("[data-slot=habit-day]")?.className).toContain("size-5");
    }
  });

  it("says nothing about the user anywhere in its own markup", () => {
    const { container } = render(
      <HabitCard
        name="Gym"
        target="Every day"
        consistency="41%"
        xpReward={5}
        week={[day({ key: "a", state: "open", label: "Monday: not recorded" })]}
      />,
    );

    expect(container.textContent?.toLowerCase()).not.toMatch(
      /missed|failed|behind|lazy|broken|streak lost/,
    );
  });
});

describe("HabitHeatmap", () => {
  it("accepts repeated one-letter day labels without a duplicate-key error", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <HabitHeatmap
        caption="Gym, day by day"
        dayLabels={["M", "T", "W", "T", "F", "S", "S"]}
        weeks={[{ key: "2026-09-07", days: [null, null, null, null, null, null, null] }]}
      />,
    );
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("labels every cell with its date and state", () => {
    render(
      <HabitHeatmap
        caption="Gym, day by day"
        dayLabels={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]}
        weeks={[
          {
            key: "2026-09-07",
            days: [
              { key: "2026-09-07", state: "met", label: "Monday, September 7, 2026: done" },
              {
                key: "2026-09-08",
                state: "open",
                label: "Tuesday, September 8, 2026: not recorded",
              },
              null,
              null,
              null,
              null,
              null,
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText("Monday, September 7, 2026: done")).toBeDefined();
    expect(screen.getByText("Tuesday, September 8, 2026: not recorded")).toBeDefined();
    expect(screen.getByRole("group", { name: "Gym, day by day" })).toBeDefined();
  });
});
