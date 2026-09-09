import {
  CircleCheckIcon,
  FolderOpenIcon,
  ListTodoIcon,
  PlusIcon,
  CalendarClockIcon,
} from "lucide-react";

import { setTaskCompletion } from "@/features/tasks/actions";
import { taskHref } from "@/features/tasks/view-params";
import { defineCommands, type CommandContext, type TaskPickerMode } from "@/features/palette/types";

/**
 * What the task manager contributes to the command palette.
 *
 * Five declarations and no palette code: the picker the three task actions
 * share is described here too, because "which list, and what happens when you
 * choose from it" is the task manager's question, not the palette's
 * (specs/11-command-palette.md).
 */

const completeTask: TaskPickerMode = {
  kind: "tasks",
  heading: "Complete a task",
  placeholder: "Which task is done?",
  empty: "No open task matches.",
  onSelect: (task, context) => {
    context.close();
    context.perform({
      success: `Completed “${task.title}”`,
      failure: "Momentum could not complete that task.",
      // The trusted path, exactly as the checkbox uses it: completion, its
      // timestamp and its XP are the database's to write (Domain Rule 15).
      action: () => setTaskCompletion({ id: task.id, completed: true }),
    });
  },
};

const scheduleTask: TaskPickerMode = {
  kind: "tasks",
  heading: "Schedule a task",
  placeholder: "Which task needs time?",
  empty: "No open task matches.",
  /*
   * Scheduling is reserving a block, and the surface that does that is the
   * task's own detail sheet — where the 0..n work blocks live (Domain Rule 2).
   * The palette takes the user there rather than inventing a second scheduling
   * dialog that would have to be kept in step with the first.
   */
  onSelect: (task, context) => open(task.id, context, `Opening “${task.title}” to schedule work`),
};

const openTask: TaskPickerMode = {
  kind: "tasks",
  heading: "Search tasks",
  placeholder: "Search your tasks…",
  empty: "No open task matches.",
  onSelect: (task, context) => open(task.id, context, `Opening “${task.title}”`),
};

function open(id: string, context: CommandContext, announcement: string): void {
  context.announce(announcement);
  context.navigate(taskHref({ taskId: id }));
}

export const taskCommands = defineCommands("tasks", [
  {
    id: "tasks.create",
    group: "create",
    label: "Add task",
    icon: PlusIcon,
    keywords: ["new", "capture", "quick add", "todo"],
    shortcut: ["Q"],
    run: (context) => context.quickAdd(),
  },
  {
    id: "tasks.complete",
    group: "action",
    label: "Complete task",
    icon: CircleCheckIcon,
    keywords: ["done", "finish", "check off"],
    run: (context) => context.enter(completeTask),
  },
  {
    id: "tasks.schedule",
    group: "action",
    label: "Schedule task",
    icon: CalendarClockIcon,
    keywords: ["plan", "book time", "work block"],
    run: (context) => context.enter(scheduleTask),
  },
  {
    id: "tasks.search",
    group: "action",
    label: "Search tasks",
    icon: ListTodoIcon,
    keywords: ["find", "open"],
    run: (context) => context.enter(openTask),
  },
  {
    id: "projects.search",
    group: "action",
    label: "Search projects",
    icon: FolderOpenIcon,
    keywords: ["find", "open", "folder"],
    run: (context) =>
      context.enter({
        kind: "projects",
        heading: "Search projects",
        placeholder: "Search your projects…",
        empty: "No project matches.",
        onSelect: (project, inner) => {
          inner.announce(`Opening ${project.name}`);
          inner.navigate(taskHref({ view: "project", projectId: project.id }));
        },
      }),
  },
]);
