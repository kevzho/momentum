import { describe, expect, it } from "vitest";

import { parseSidebarState } from "@/lib/sidebar-state";

describe("sidebar state", () => {
  it("defaults to expanded for a missing or unrecognised cookie", () => {
    expect(parseSidebarState(undefined)).toBe("expanded");
    expect(parseSidebarState("")).toBe("expanded");
    expect(parseSidebarState("nonsense")).toBe("expanded");
  });

  it("reads a persisted collapsed rail", () => {
    expect(parseSidebarState("collapsed")).toBe("collapsed");
  });
});
