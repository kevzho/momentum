import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AnalyticsView } from "@/features/analytics/components/analytics-view";
import { analyticsData, at, busyRows, manyBlocks } from "@/features/analytics/fixtures";

// Assertions are on the hidden tables, not the SVG: the table is the page's
// contract with a screen reader.

/** The rows of one figure's data table, as arrays of cell text. */
function tableRows(title: string): string[][] {
  const table = within(figure(title)).getByRole("table");
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole("cell")
        .concat(within(row).getAllByRole("rowheader"))
        .map((cell) => cell.textContent ?? ""),
    );
}

function figure(title: string): HTMLElement {
  return screen.getByRole("figure", { name: title });
}

// Addressed by slot attribute: "Focused time" is a tile label and a column
// header, which is fatal to `getByText`.
function statTile(label: string): string {
  const tiles = [...document.querySelectorAll("[data-slot='stat-tile']")];
  const tile = tiles.find((node) => node.firstElementChild?.textContent === label);
  if (tile === undefined) throw new Error(`no stat tile labelled ${label}`);
  return tile.children[1]?.textContent ?? "";
}

describe("the six visualizations", () => {
  it("all render, each with its own accessible data table", () => {
    render(<AnalyticsView data={analyticsData(busyRows())} />);

    for (const title of [
      "Focus time by day",
      "Focus time by project",
      "Planned vs. actual",
      "Consistency by day",
      "Completion trend",
      "Time of day",
    ]) {
      const found = figure(title);
      expect(within(found).getByRole("table")).toBeTruthy();
    }
  });

  it("gives every table a caption naming what it holds", () => {
    render(<AnalyticsView data={analyticsData(busyRows())} />);

    const table = within(figure("Focus time by day")).getByRole("table");
    expect(table.querySelector("caption")?.textContent).toBe(
      "Focus time by day — the same data as a table",
    );
  });

  it("draws one row per day of the window, including the quiet ones", () => {
    render(<AnalyticsView data={analyticsData(busyRows())} />);

    // The default window is 30 days.
    expect(tableRows("Focus time by day")).toHaveLength(30);
    expect(tableRows("Completion trend")).toHaveLength(30);
  });

  it("draws all 24 hours of the day, not only the busy ones", () => {
    render(<AnalyticsView data={analyticsData(busyRows())} />);

    expect(tableRows("Time of day")).toHaveLength(24);
  });
});

describe("the time windows", () => {
  it("offers all three and switches between them without a reload", () => {
    render(<AnalyticsView data={analyticsData(busyRows())} />);

    expect(tableRows("Focus time by day")).toHaveLength(30);

    fireEvent.click(screen.getByRole("radio", { name: "Last 7 days" }));
    expect(tableRows("Focus time by day")).toHaveLength(7);

    fireEvent.click(screen.getByRole("radio", { name: "Last 90 days" }));
    expect(tableRows("Focus time by day")).toHaveLength(90);
  });

  it("moves the totals with the window", () => {
    render(<AnalyticsView data={analyticsData(busyRows())} />);

    // 50 + 25 + 90 within 7 days; + 45 within 30; + 120 within 90.
    fireEvent.click(screen.getByRole("radio", { name: "Last 7 days" }));
    expect(statTile("Focused time")).toBe("2h 45m");

    fireEvent.click(screen.getByRole("radio", { name: "Last 30 days" }));
    expect(statTile("Focused time")).toBe("3h 30m");

    fireEvent.click(screen.getByRole("radio", { name: "Last 90 days" }));
    expect(statTile("Focused time")).toBe("5h 30m");
  });
});

describe("planned against actual", () => {
  it("keeps the two values in separate columns and never merges them", () => {
    render(<AnalyticsView data={analyticsData(busyRows())} />);

    const headers = within(figure("Planned vs. actual"))
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);
    expect(headers).toEqual(["Project", "Planned", "Actual", "Tasks"]);

    // Thesis: two comparable tasks, 60 + 30 planned against 95 + 40 actual.
    const rows = tableRows("Planned vs. actual");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("1h 30m");
    expect(rows[0]).toContain("2h 15m");
    expect(rows[0]).toContain("Thesis");
  });

  // The 240 recorded minutes of an unestimated task must not appear on the actual side.
  it("leaves an unestimated task out of both sides and says how many it left out", () => {
    render(<AnalyticsView data={analyticsData(busyRows())} />);

    const rows = tableRows("Planned vs. actual");
    expect(rows.flat().join(" ")).not.toContain("4h");
    expect(
      within(figure("Planned vs. actual")).getByText(/1 completed task is not shown here/i),
    ).toBeTruthy();
  });
});

describe("the patterns panel", () => {
  it("says nothing until a window holds enough recorded work", () => {
    render(<AnalyticsView data={analyticsData(busyRows())} />);

    expect(screen.getByText(/No patterns yet/i)).toBeTruthy();
  });

  it("states a measurement, with its caveat, once the sample is large enough", () => {
    render(<AnalyticsView data={analyticsData(manyBlocks())} />);

    expect(
      screen.getByText("You marked 80% of the 15 work blocks scheduled in this period as done."),
    ).toBeTruthy();
    expect(screen.getByText(/not reasons/i)).toBeTruthy();
  });

  /** The threshold is a window's, so narrowing the window can take it back below. */
  it("falls silent again when the window is narrowed below the threshold", () => {
    render(<AnalyticsView data={analyticsData(manyBlocks())} />);

    fireEvent.click(screen.getByRole("radio", { name: "Last 7 days" }));
    expect(screen.getByText(/No patterns yet/i)).toBeTruthy();
  });
});

describe("a new account", () => {
  it("sees a designed empty state rather than six empty charts", () => {
    render(<AnalyticsView data={analyticsData()} />);

    expect(screen.getByText("Nothing recorded yet")).toBeTruthy();
    expect(screen.queryByRole("figure")).toBeNull();
    expect(screen.queryByRole("radio", { name: "Last 7 days" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Analytics");
  });

  it("shows one page heading and no more", () => {
    render(<AnalyticsView data={analyticsData(busyRows())} />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});

describe("a window with a gap in it", () => {
  it("keeps the charts and the range control when only the narrow window is empty", () => {
    const data = analyticsData({
      ...busyRows(),
      focusSessions: [{ startedAt: at("2026-04-20", 9), actualMinutes: 60, projectId: "p1" }],
      completedTasks: [],
      workBlocks: [],
      habits: [],
      habitCompletions: [],
    });

    render(<AnalyticsView data={data} />);
    fireEvent.click(screen.getByRole("radio", { name: "Last 7 days" }));

    expect(screen.queryByText("Nothing recorded yet")).toBeNull();
    expect(
      within(figure("Focus time by day")).getByText(/No focus sessions were recorded/i),
    ).toBeTruthy();
  });
});

describe("a habit rate with nothing behind it", () => {
  it("renders an em dash rather than claiming zero percent", () => {
    render(<AnalyticsView data={analyticsData(manyBlocks())} />);

    expect(statTile("Habit consistency")).toBe("—");
  });
});
