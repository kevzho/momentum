import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageHeaderSkeleton, RowsSkeleton } from "@/components/skeletons";
import { PageHeader } from "@momentum/ui/components/page-header";
import { TaskRow } from "@momentum/ui/components/task-row";

// Asserts the shared box model rather than pixel heights, which jsdom does not lay out.
describe("route skeletons", () => {
  it("gives the header skeleton the same minimum height as PageHeader", () => {
    const { container: real } = render(<PageHeader title="Tasks" />);
    const { container: skeleton } = render(<PageHeaderSkeleton />);
    expect(real.firstElementChild?.className).toContain("md:min-h-8");
    expect(skeleton.firstElementChild?.className).toContain("md:min-h-8");
  });

  it("gives skeleton rows the height and gap of a task row list", () => {
    const { container: row } = render(<TaskRow title="Problem set 4" />);
    const { container: skeleton } = render(<RowsSkeleton rows={3} />);
    // TaskRow is py-1.5 around h-5 content; the skeleton row is a flat h-8.
    expect(row.firstElementChild?.className).toContain("py-1.5");
    expect(skeleton.firstElementChild?.className).toContain("gap-0.5");
    expect(skeleton.querySelectorAll('[data-slot="skeleton"]').length).toBe(3);
    for (const node of skeleton.querySelectorAll('[data-slot="skeleton"]')) {
      expect(node.className).toContain("h-8");
    }
  });
});
