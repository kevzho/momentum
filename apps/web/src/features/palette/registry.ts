import type { Route } from "next";

import { PRIMARY_NAV, SETTINGS_NAV, type NavItem } from "@/lib/nav";

import { calendarCommands } from "@/features/calendar/commands";
import { focusCommands } from "@/features/focus/commands";
import { habitCommands } from "@/features/habits/commands";
import { taskCommands } from "@/features/tasks/commands";
import { defineCommands, type CommandSource, type PaletteCommand } from "@/features/palette/types";

/**
 * The command registry (docs/ARCHITECTURE.md §7: "module-level registry +
 * context").
 *
 * A feature declares its commands in its own `features/<feature>/commands.ts`
 * and registers the source here — one import and one line. Nothing under
 * `features/palette/components` mentions a task, a habit or a focus session,
 * so adding a command to an existing feature touches exactly one file and
 * adding a whole new feature's commands touches two.
 *
 * Registration is keyed by feature name, which makes it idempotent: a module
 * evaluated twice (a hot reload, a test importing it again) replaces its own
 * entry instead of duplicating every command in it.
 */

const SOURCES = new Map<string, CommandSource>();

export function registerCommands(source: CommandSource): void {
  SOURCES.set(source.feature, source);
}

/**
 * Navigation is **derived** from the navigation registry rather than declared.
 *
 * `lib/nav.ts` is already the one list the sidebar, the mobile drawer and the
 * top bar's section name read (Phase 1). Deriving the palette's `Go to`
 * commands from it means a route added there is reachable by ⌘K on the same
 * commit — a route that exists in one place and not the other is the exact
 * failure that registry was built to prevent.
 */
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
registerCommands(calendarCommands);
registerCommands(habitCommands);
registerCommands(focusCommands);

/** Every registered command, in registration order. */
export function paletteCommands(): readonly PaletteCommand[] {
  return [...SOURCES.values()].flatMap((source) => source.commands);
}
