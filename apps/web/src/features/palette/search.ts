import type { ProjectSummaryWithCount, TaskSummary } from "@/features/tasks/types";

import { fuzzyScore, fuzzyScoreAny } from "@/features/palette/fuzzy";
import { recentIds, usageBonus, type CommandUsageMap } from "@/features/palette/recents";
import { COMMAND_GROUPS, GROUP_HEADINGS, type PaletteCommand } from "@/features/palette/types";

// What the palette shows, computed as data; the dialog holds no ranking logic.

export interface CommandItem {
  kind: "command";
  key: string;
  score: number;
  command: PaletteCommand;
}

export interface TaskItem {
  kind: "task";
  key: string;
  score: number;
  task: TaskSummary;
  project: ProjectSummaryWithCount | null;
}

export interface ProjectItem {
  kind: "project";
  key: string;
  score: number;
  project: ProjectSummaryWithCount;
}

export type PaletteItem = CommandItem | TaskItem | ProjectItem;

export interface PaletteSection {
  id: string;
  heading: string;
  items: readonly PaletteItem[];
}

export const ROOT_TASK_LIMIT = 6;
export const ROOT_PROJECT_LIMIT = 4;
export const PICKER_LIMIT = 50;
/** Recent commands shown above everything else when nothing has been typed. */
export const RECENT_LIMIT = 4;

export interface RootSearchInput {
  query: string;
  commands: readonly PaletteCommand[];
  tasks: readonly TaskSummary[];
  projects: readonly ProjectSummaryWithCount[];
  usage: CommandUsageMap;
  /** Epoch milliseconds; passed in so the ranking is testable. */
  now: number;
}

/**
 * The root list. Nothing typed: recent commands, then every command under its
 * heading (no user data). Something typed: commands, tasks and projects all
 * compete, and the section holding the best match comes first.
 */
export function rootSections(input: RootSearchInput): PaletteSection[] {
  const { query, commands, tasks, projects, usage, now } = input;

  if (query.trim() === "") return restingSections(commands, usage, now);

  const commandItems = commands
    .map((command) => scoreCommand(command, query, usage, now))
    .filter(isPresent);

  const taskItems = rankTasks(query, tasks, projects).slice(0, ROOT_TASK_LIMIT);
  const projectItems = rankProjects(query, projects).slice(0, ROOT_PROJECT_LIMIT);

  const sections: PaletteSection[] = [];
  for (const group of COMMAND_GROUPS) {
    const items = commandItems.filter((item) => item.command.group === group);
    if (items.length > 0)
      sections.push({ id: group, heading: GROUP_HEADINGS[group], items: sortByScore(items) });
  }
  if (taskItems.length > 0) sections.push({ id: "tasks", heading: "Tasks", items: taskItems });
  if (projectItems.length > 0) {
    sections.push({ id: "projects", heading: "Projects", items: projectItems });
  }

  return byBestItem(sections);
}

/** The picker a `Complete task` or `Schedule task` command drops the user into. */
export function taskSections(
  query: string,
  tasks: readonly TaskSummary[],
  projects: readonly ProjectSummaryWithCount[],
): PaletteSection[] {
  const items = rankTasks(query, tasks, projects).slice(0, PICKER_LIMIT);
  return items.length === 0 ? [] : [{ id: "tasks", heading: "Tasks", items }];
}

export function projectSections(
  query: string,
  projects: readonly ProjectSummaryWithCount[],
): PaletteSection[] {
  const items = rankProjects(query, projects).slice(0, PICKER_LIMIT);
  return items.length === 0 ? [] : [{ id: "projects", heading: "Projects", items }];
}

export function countItems(sections: readonly PaletteSection[]): number {
  return sections.reduce((total, section) => total + section.items.length, 0);
}

export function firstItem(sections: readonly PaletteSection[]): PaletteItem | null {
  for (const section of sections) {
    const [item] = section.items;
    if (item !== undefined) return item;
  }
  return null;
}

function restingSections(
  commands: readonly PaletteCommand[],
  usage: CommandUsageMap,
  now: number,
): PaletteSection[] {
  const byId = new Map(commands.map((command) => [command.id, command]));
  const recent = recentIds(usage)
    .map((id) => byId.get(id))
    .filter(isPresent)
    .slice(0, RECENT_LIMIT);

  const recentSet = new Set(recent.map((command) => command.id));
  const sections: PaletteSection[] = [];

  if (recent.length > 0) {
    sections.push({
      id: "recent",
      heading: "Recent",
      items: recent.map((command) => commandItem(command, usageBonus(usage[command.id], now))),
    });
  }

  for (const group of COMMAND_GROUPS) {
    const items = commands
      .filter((command) => command.group === group && !recentSet.has(command.id))
      .map((command) => commandItem(command, 0));
    if (items.length > 0) {
      sections.push({ id: group, heading: GROUP_HEADINGS[group], items });
    }
  }

  return sections;
}

function scoreCommand(
  command: PaletteCommand,
  query: string,
  usage: CommandUsageMap,
  now: number,
): CommandItem | null {
  const score = fuzzyScoreAny(query, command.label, [
    ...(command.keywords ?? []),
    GROUP_HEADINGS[command.group],
  ]);
  if (score === null) return null;
  return commandItem(command, score + usageBonus(usage[command.id], now));
}

function commandItem(command: PaletteCommand, score: number): CommandItem {
  return { kind: "command", key: `command:${command.id}`, score, command };
}

function rankTasks(
  query: string,
  tasks: readonly TaskSummary[],
  projects: readonly ProjectSummaryWithCount[],
): TaskItem[] {
  const byId = new Map(projects.map((project) => [project.id, project]));

  const items = tasks
    .map((task): TaskItem | null => {
      const project = task.projectId === null ? null : (byId.get(task.projectId) ?? null);
      const score = fuzzyScoreAny(query, task.title, project === null ? [] : [project.name]);
      if (score === null) return null;
      return { kind: "task", key: `task:${task.id}`, score, task, project };
    })
    .filter(isPresent);

  return sortByScore(items);
}

function rankProjects(query: string, projects: readonly ProjectSummaryWithCount[]): ProjectItem[] {
  const items = projects
    .map((project): ProjectItem | null => {
      const score = fuzzyScore(query, project.name);
      if (score === null) return null;
      return { kind: "project", key: `project:${project.id}`, score, project };
    })
    .filter(isPresent);

  return sortByScore(items);
}

// Best first; ties keep declaration order (the sort is stable).
function sortByScore<T extends PaletteItem>(items: T[]): T[] {
  return [...items].sort((left, right) => right.score - left.score);
}

function byBestItem(sections: readonly PaletteSection[]): PaletteSection[] {
  return [...sections].sort((left, right) => bestScore(right) - bestScore(left));
}

function bestScore(section: PaletteSection): number {
  return section.items[0]?.score ?? Number.NEGATIVE_INFINITY;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
