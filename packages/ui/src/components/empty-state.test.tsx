import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CircleDashedIcon } from "lucide-react";

import { EmptyState } from "@momentum/ui/components/empty-state";

describe("EmptyState", () => {
  it("renders its title as a paragraph by default and as the page heading on request", () => {
    const { rerender } = render(<EmptyState icon={CircleDashedIcon} title="Nothing here" />);
    expect(screen.queryByRole("heading")).toBeNull();

    rerender(<EmptyState icon={CircleDashedIcon} title="Nothing here" titleAs="h1" />);
    expect(screen.getByRole("heading", { level: 1, name: "Nothing here" })).toBeDefined();
  });
});
