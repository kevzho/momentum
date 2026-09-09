import type { Route } from "next";

import { PRIMARY_NAV, SETTINGS_NAV, type NavItem } from "@/lib/nav";

import { calendarCommands } from "@/features/calendar/commands";
import { focusCommands } from "@/features/focus/commands";
import { habitCommands } from "@/features/habits/commands";
import { projectCommands } from "@/features/projects/commands";
import { taskCommands } from "@/features/tasks/commands";
import { defineCommands, type CommandSource, type PaletteCommand } from "@/features/palette/types";

// Keyed by feature name so a module evaluated twice (hot reload, a test
// re-import) replaces its entry instead of duplicating its commands.
const SOURCES = new Map<string, CommandSource>();

export function registerCommands(source: CommandSource): void {
  SOURCES.set(source.feature, source);
}

// Derived from `lib/nav.ts` so a route added there is reachable by ⌘K.
function navigationCommands(): CommandSource {
  const items: readonly NavItem[] = [...PRIMARY_NAV, SETTINGS_NAV];

  return defineCommands(
    "navigation",
    items.map((item) => ({
      id: `navigate:${item.href}`,
      group: "navigate" as const,
      label: item.label,
      icon: item.icon,
      keywords: [item.href.replace("/", "")],
      run: (context) => context.navigate(item.href as Route),
    })),
  );
}

registerCommands(navigationCommands());
registerCommands(taskCommands);
registerCommands(projectCommands);
registerCommands(calendarCommands);
registerCommands(habitCommands);
registerCommands(focusCommands);

/** Every registered command, in registration order. */
export function paletteCommands(): readonly PaletteCommand[] {
  return [...SOURCES.values()].flatMap((source) => source.commands);
}
