import type { Route } from "next";
import type { LucideIcon } from "lucide-react";

import type { ActionResult } from "@/lib/actions/result";
import type { QuickAddDefaults } from "@/features/tasks/components/quick-add";
import type { ProjectSummaryWithCount, TaskSummary } from "@/features/tasks/types";

// The palette renders a list and calls `run`; features declare commands in
// their own `commands.ts`.

export const COMMAND_GROUPS = ["navigate", "create", "action"] as const;
export type CommandGroup = (typeof COMMAND_GROUPS)[number];

export const GROUP_HEADINGS: Record<CommandGroup, string> = {
  navigate: "Go to",
  create: "Create",
  action: "Actions",
};

/** What a command may do when it runs; the palette owns the mechanics. */
export interface CommandContext {
  /** Follow a typed route and close the palette. */
  navigate: (href: Route) => void;
  /** Open Quick Add, optionally seeded. Closes the palette first. */
  quickAdd: (defaults?: QuickAddDefaults) => void;
  /** Replace the list with a picker over the user's own data; stays open. */
  enter: (mode: PaletteMode) => void;
  close: () => void;
  announce: (message: string) => void;
  /** Run a server action: one transition, a toast with Retry on failure, a toast on success. */
  perform: (work: PaletteWork) => void;
}

export interface PaletteWork {
  /** Announced and toasted on success. */
  success: string;
  /** Prefixed to the server's own message when the write fails. */
  failure: string;
  action: () => Promise<ActionResult<unknown>>;
}

export interface PaletteCommand {
  /** Stable across releases: it keys the recent/frequent ordering. */
  id: string;
  group: CommandGroup;
  label: string;
  icon: LucideIcon;
  /** Extra words the fuzzy matcher searches — synonyms, not a description. */
  keywords?: readonly string[];
  /** Rendered on the right, e.g. `["Q"]`. Display only; the binding lives elsewhere. */
  shortcut?: readonly string[];
  run: (context: CommandContext) => void;
}

/** A picker over the user's own data, entered by a command. */
export type PaletteMode = RootMode | TaskPickerMode | ProjectPickerMode;

export interface RootMode {
  kind: "root";
}

interface PickerMode {
  /** Shown in place of the palette's own placeholder. */
  placeholder: string;
  /** Shown when nothing matches. */
  empty: string;
  /** The line above the input, so the user can see which question is being asked. */
  heading: string;
}

export interface TaskPickerMode extends PickerMode {
  kind: "tasks";
  onSelect: (task: TaskSummary, context: CommandContext) => void;
}

export interface ProjectPickerMode extends PickerMode {
  kind: "projects";
  onSelect: (project: ProjectSummaryWithCount, context: CommandContext) => void;
}

export const ROOT_MODE: RootMode = { kind: "root" };

/** A feature's contribution to the registry. */
export interface CommandSource {
  feature: string;
  commands: readonly PaletteCommand[];
}

export function defineCommands(
  feature: string,
  commands: readonly PaletteCommand[],
): CommandSource {
  return { feature, commands };
}
