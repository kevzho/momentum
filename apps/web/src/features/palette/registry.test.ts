import { describe, expect, it, vi } from "vitest";

import { PRIMARY_NAV, SETTINGS_NAV } from "@/lib/nav";

vi.mock("@/features/tasks/actions", () => ({ setTaskCompletion: vi.fn() }));

const { paletteCommands, registerCommands } = await import("@/features/palette/registry");
const { defineCommands } = await import("@/features/palette/types");
const { ListTodoIcon } = await import("lucide-react");

describe("the registered commands", () => {
  it("gives every command a unique id, because the id keys the recent ordering", () => {
    const ids = paletteCommands().map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers every navigation destination, derived from the navigation registry", () => {
    const navigate = paletteCommands().filter((command) => command.group === "navigate");
    expect(navigate.map((command) => command.label)).toEqual([
      ...PRIMARY_NAV.map((item) => item.label),
      SETTINGS_NAV.label,
    ]);
  });

  it("covers the creation and action commands the spec names", () => {
    const byGroup = (group: string) =>
      paletteCommands()
        .filter((command) => command.group === group)
        .map((command) => command.label);

    expect(byGroup("create")).toEqual(
      expect.arrayContaining([
        "Add task",
        "Add event",
        "Add habit",
        "New project",
        "Start focus session",
      ]),
    );
    expect(byGroup("action")).toEqual(
      expect.arrayContaining(["Complete task", "Schedule task", "Search tasks", "Search projects"]),
    );
  });

  it("gives every command something to render", () => {
    for (const command of paletteCommands()) {
      expect(command.label).not.toBe("");
      // A lucide icon is a `forwardRef` object, not a plain function.
      expect(command.icon).toBeTruthy();
      expect(command.run).toBeTypeOf("function");
    }
  });
});

describe("registering a feature", () => {
  it("adds its commands without any palette change", () => {
    const before = paletteCommands().length;

    registerCommands(
      defineCommands("review", [
        {
          id: "review.start",
          group: "action",
          label: "Start weekly review",
          icon: ListTodoIcon,
          run: () => {},
        },
      ]),
    );

    const after = paletteCommands();
    expect(after).toHaveLength(before + 1);
    expect(after.map((command) => command.id)).toContain("review.start");
  });

  it("is idempotent per feature, so a module evaluated twice does not double its list", () => {
    const source = defineCommands("review", [
      {
        id: "review.start",
        group: "action",
        label: "Start weekly review",
        icon: ListTodoIcon,
        run: () => {},
      },
    ]);

    registerCommands(source);
    const once = paletteCommands().length;
    registerCommands(source);
    expect(paletteCommands()).toHaveLength(once);
  });
});
