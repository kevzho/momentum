import { describe, expect, it } from "vitest";
import { PROJECT_COLORS } from "@momentum/core/types";

import { projectSurface } from "@momentum/ui/components/project-dot";

/** A hue missing from the written-out palette record renders with no background at all. */
describe("project palette", () => {
  it("maps every PROJECT_COLORS hue to its three tokens", () => {
    for (const color of PROJECT_COLORS) {
      const classes = projectSurface(color);
      expect(classes, color).toContain(`bg-project-${color}`);
      expect(classes, color).toContain(`text-project-${color}-fg`);
      expect(classes, color).toContain(`border-project-${color}-border`);
    }
  });
});
