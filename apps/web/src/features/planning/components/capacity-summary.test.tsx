import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { WeekCapacity } from "@momentum/core/scheduling";

import { CapacitySummary } from "@/features/planning/components/capacity-summary";

const CAPACITY: WeekCapacity = {
  plannedMinutes: 18 * 60 + 35,
  availableMinutes: 12 * 60 + 10,
  unscheduledMinutes: 4 * 60 + 20,
  workingMinutes: 40 * 60,
  days: [],
};

function valueOf(label: string): string | undefined {
  return screen.getByText(label).nextElementSibling?.textContent ?? undefined;
}

describe("CapacitySummary", () => {
  it("prints the three totals with formatDuration, and marks the available one as approximate", () => {
    render(<CapacitySummary capacity={CAPACITY} />);

    expect(valueOf("Planned")).toBe("18h 35m");
    expect(valueOf("Available")).toBe("~12h 10m");
    expect(valueOf("Unscheduled work")).toBe("4h 20m");
  });

  it("prints zero as a number, not as a blank", () => {
    render(
      <CapacitySummary
        capacity={{ ...CAPACITY, plannedMinutes: 0, availableMinutes: 0, unscheduledMinutes: 0 }}
      />,
    );

    expect(valueOf("Planned")).toBe("0m");
    expect(valueOf("Available")).toBe("~0m");
    expect(valueOf("Unscheduled work")).toBe("0m");
  });
});
