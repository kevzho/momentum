import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TasksSkeleton } from "@/features/tasks/components/tasks-skeleton";

/**
 * The skeleton exists to hold the space the page will occupy, so the two have to
 * describe the same layout (docs/ARCHITECTURE.md §15). This one drew four
 * labelled sections long after the page stopped rendering any, which is a
 * several-hundred-pixel jump on every cold navigation to `/tasks`. These assert
 * the shape rather than pixel heights, which jsdom does not lay out.
 */
describe("TasksSkeleton", () => {
  it("draws no sections, because the shipped list has none", () => {
    const { container } = render(<TasksSkeleton />);

    expect(container.querySelectorAll("section").length).toBe(0);
  });

  it("reserves the tab row, the toolbar, the key hint and one flat list", () => {
    const { container } = render(<TasksSkeleton />);

    const column = container.querySelector(".flex-col.gap-3");
    expect(column).not.toBeNull();

    // Tabs are Button size="sm" (h-7); the toolbar's tallest child is its search
    // Input (h-8); the key hint is one line of Kbd glyphs (h-4).
    const reserved = [...(column?.children ?? [])].map((node) => node.className);
    expect(reserved[0]).toContain("h-7");
    expect(reserved[1]).toContain("h-8");
    expect(reserved[2]).toContain("h-4");

    const rows = column?.lastElementChild;
    expect(rows?.className).toContain("gap-0.5");
    expect(rows?.querySelectorAll('[data-slot="skeleton"]').length).toBe(6);
  });
});
