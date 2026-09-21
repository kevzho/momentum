import { describe, expect, it } from "vitest";

import { PRIMARY_NAV, SETTINGS_NAV, isActive, returnableRoute, sectionLabel } from "@/lib/nav";

describe("navigation registry", () => {
  it("covers every route the shell claims to navigate to", () => {
    expect(PRIMARY_NAV.map((item) => item.href)).toEqual([
      "/today",
      "/calendar",
      "/tasks",
      "/courses",
      "/habits",
      "/focus",
      "/progress",
      "/analytics",
    ]);
    expect(SETTINGS_NAV.href).toBe("/settings");
  });

  it("labels a section from its pathname, including nested paths", () => {
    expect(sectionLabel("/calendar")).toBe("Calendar");
    expect(sectionLabel("/tasks/abc-123")).toBe("Tasks");
    expect(sectionLabel("/settings")).toBe("Settings");
    expect(sectionLabel("/nowhere")).toBeNull();
  });

  it("marks a nested path active without matching a sibling prefix", () => {
    expect(isActive("/tasks/abc", "/tasks")).toBe(true);
    expect(isActive("/tasks", "/tasks")).toBe(true);
    expect(isActive("/tasks-archive", "/tasks")).toBe(false);
  });
});

describe("returnable routes", () => {
  it("returns the route itself, without whatever the query string carried", () => {
    expect(returnableRoute("/calendar")).toBe("/calendar");
    expect(returnableRoute("/tasks?view=today#first")).toBe("/tasks");
    expect(returnableRoute("/settings")).toBe("/settings");
  });

  it.each([
    ["a protocol-relative path", "//evil.example"],
    ["a backslash the URL parser reads as a second slash", "/\\evil.example"],
    ["a tab before the second slash", "/\t/evil.example"],
    ["an absolute URL", "https://evil.example"],
    ["a route the app does not have", "/nowhere"],
    ["a relative path", "calendar"],
  ])("refuses %s", (_case, value) => {
    // An allow-list rather than a prefix test: the WHATWG parser folds `\` and
    // C0 whitespace into `/`, so no test on the raw string can tell an off-site
    // destination from a local path.
    expect(returnableRoute(value)).toBeNull();
  });

  it("refuses an absent value", () => {
    expect(returnableRoute(null)).toBeNull();
    expect(returnableRoute(undefined)).toBeNull();
  });
});
