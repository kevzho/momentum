import { describe, expect, it } from "vitest";
import { PROJECT_COLORS } from "@momentum/core/types";

import { projectSurface } from "@momentum/ui/components/project-dot";

/**
 * Tailwind cannot generate a class name that is assembled at runtime, so the
 * project palette is a written-out record. If a hue is added to
 * PROJECT_COLORS and not to that record, blocks in that colour render with no
 * background at all — a silent, visual-only failure. This catches it.
 */
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
