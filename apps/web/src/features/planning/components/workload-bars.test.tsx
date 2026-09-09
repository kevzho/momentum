import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DayWorkload } from "@momentum/core/scheduling";
import { localDate, weekdayOf } from "@momentum/core/time";
import type { LocalDate } from "@momentum/core/types";

import {
  WorkloadBars,
  workloadRows,
  workloadScale,
} from "@/features/planning/components/workload-bars";

const DAYS: readonly LocalDate[] = [
  "2026-09-07",
  "2026-09-08",
  "2026-09-09",
  "2026-09-10",
  "2026-09-11",
  "2026-09-12",
  "2026-09-13",
].map(localDate);

const TODAY = localDate("2026-09-08");

function workload(
  date: LocalDate,
  plannedMinutes: number,
  workingMinutes: number,
  isPast = false,
): DayWorkload {
  return {
    date,
    weekday: weekdayOf(date),
    plannedMinutes,
    workMinutes: plannedMinutes,
    eventMinutes: 0,
    workingMinutes,
    availableMinutes: Math.max(0, workingMinutes - plannedMinutes),
    isPast,
  };
}

const WORKLOADS: DayWorkload[] = [
  workload(DAYS[0]!, 390, 480, true),
  workload(DAYS[1]!, 240, 480),
  workload(DAYS[2]!, 0, 0),
  workload(DAYS[3]!, 600, 480),
  workload(DAYS[4]!, 0, 480),
  workload(DAYS[5]!, 0, 0),
  workload(DAYS[6]!, 0, 0),
];

function barWidths(row: HTMLElement): { bar: string; track: string } {
  return {
    bar: row.querySelector<HTMLElement>('[data-slot="workload-bar"]')?.style.width ?? "",
    track: row.querySelector<HTMLElement>('[data-slot="workload-track"]')?.style.width ?? "",
  };
}

describe("workloadScale", () => {
  it("is the longest planned or working day, and never under an hour", () => {
    expect(workloadScale(WORKLOADS)).toBe(600);
    expect(workloadScale([workload(DAYS[0]!, 20, 30)])).toBe(60);
    expect(workloadScale([])).toBe(60);
  });
});

describe("workloadRows", () => {
  it("follows the displayed days and fills a missing day with zeros", () => {
    const rows = workloadRows([DAYS[1]!, DAYS[0]!], [WORKLOADS[0]!], TODAY);
    expect(rows).toEqual([
      { date: DAYS[1], plannedMinutes: 0, workingMinutes: 0, isPast: false },
      { date: DAYS[0], plannedMinutes: 390, workingMinutes: 480, isPast: true },
    ]);
  });
});

describe("WorkloadBars", () => {
  it("names each row with the day, the planned time and the working window", () => {
    render(<WorkloadBars days={DAYS} workloads={WORKLOADS} today={TODAY} />);

    expect(
      screen.getByRole("img", { name: "Mon: 6h 30m planned, 8h of working hours." }),
    ).toBeDefined();
    expect(
      screen.getByRole("img", { name: "Tue, today: 4h planned, 8h of working hours." }),
    ).toBeDefined();
    expect(screen.getByRole("img", { name: "Wed: 0m planned, no working hours." })).toBeDefined();
    expect(
      screen.getByRole("img", { name: "Thu: 10h planned, 8h of working hours." }),
    ).toBeDefined();
    expect(screen.getAllByRole("img")).toHaveLength(7);
  });

  it("draws every bar against one shared scale, with the working window as a track behind it", () => {
    render(<WorkloadBars days={DAYS} workloads={WORKLOADS} today={TODAY} />);

    // Scale is 600 (Thursday's planned time), so 480 of working hours is 80%.
    expect(barWidths(screen.getByRole("img", { name: /^Mon:/ }))).toEqual({
      bar: "65%",
      track: "80%",
    });
    expect(barWidths(screen.getByRole("img", { name: /^Tue,/ }))).toEqual({
      bar: "40%",
      track: "80%",
    });
    expect(barWidths(screen.getByRole("img", { name: /^Wed:/ }))).toEqual({
      bar: "0%",
      track: "0%",
    });
    expect(barWidths(screen.getByRole("img", { name: /^Thu:/ }))).toEqual({
      bar: "100%",
      track: "80%",
    });
  });

  it("marks today and past days in the markup, not only by colour", () => {
    render(<WorkloadBars days={DAYS} workloads={WORKLOADS} today={TODAY} />);

    const monday = screen.getByRole("img", { name: /^Mon:/ });
    const tuesday = screen.getByRole("img", { name: /^Tue,/ });
    expect(monday.getAttribute("data-past")).toBe("true");
    expect(monday.getAttribute("data-today")).toBeNull();
    expect(tuesday.getAttribute("data-today")).toBe("true");
    expect(tuesday.getAttribute("data-past")).toBeNull();
  });

  it("shows the planned time as a compact visible label", () => {
    render(<WorkloadBars days={DAYS} workloads={WORKLOADS} today={TODAY} />);

    expect(screen.getByRole("img", { name: /^Mon:/ }).textContent).toContain("6h 30m");
    expect(screen.getByRole("img", { name: /^Wed:/ }).textContent).toContain("0m");
  });
});
