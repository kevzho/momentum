import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { PlanningWarning } from "@momentum/core/scheduling";
import { localDate } from "@momentum/core/time";

import { WarningsList } from "@/features/planning/components/warnings-list";

vi.mock("@momentum/core/scheduling", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@momentum/core/scheduling")>();
  return {
    ...actual,
    describeWarning: (warning: PlanningWarning) => `described ${warning.kind}`,
    warningKey: (warning: PlanningWarning) => JSON.stringify(warning),
  };
});

const WARNINGS: PlanningWarning[] = [
  {
    kind: "past-deadline",
    block: { id: "block-1", title: "History essay" },
    taskId: "task-essay",
    dueDate: localDate("2026-09-11"),
    date: localDate("2026-09-12"),
  },
  {
    kind: "overlap",
    date: localDate("2026-09-09"),
    first: { id: "block-2", title: "Chemistry lecture" },
    second: { id: "block-3", title: "Study group" },
    overlapMinutes: 30,
  },
  {
    kind: "over-capacity",
    date: localDate("2026-09-10"),
    plannedMinutes: 600,
    workingMinutes: 480,
  },
  {
    kind: "insufficient-time",
    taskId: "task-lab",
    title: "Lab report",
    dueDate: localDate("2026-09-09"),
    remainingMinutes: 180,
    availableMinutes: 60,
  },
];

describe("WarningsList", () => {
  it("renders one row per warning with the engine's sentence, and counts them in the heading", () => {
    render(<WarningsList warnings={WARNINGS} />);

    const list = screen.getByRole("list");
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      "described past-deadline",
      "described overlap",
      "described over-capacity",
      "described insufficient-time",
    ]);
    expect(screen.getByRole("heading", { name: "Warnings 4" })).toBeDefined();
  });

  it("gives each kind its own glyph, hidden from assistive technology", () => {
    render(<WarningsList warnings={WARNINGS} />);

    const rows = screen.getAllByRole("listitem");
    const kinds = rows.map((row) => row.getAttribute("data-kind"));
    expect(kinds).toEqual(["past-deadline", "overlap", "over-capacity", "insufficient-time"]);
    for (const row of rows) {
      const icon = row.querySelector("svg");
      expect(icon?.getAttribute("aria-hidden")).toBe("true");
    }
    const glyphs = new Set(rows.map((row) => row.querySelector("svg")?.innerHTML));
    expect(glyphs.size).toBe(4);
  });

  it("says so in one line when there is nothing to warn about", () => {
    render(<WarningsList warnings={[]} />);

    expect(screen.getByRole("heading", { name: "Warnings" })).toBeDefined();
    expect(screen.getByText("No warnings for this range.")).toBeDefined();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("is information only: nothing in it is a control", () => {
    render(<WarningsList warnings={WARNINGS} />);

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
