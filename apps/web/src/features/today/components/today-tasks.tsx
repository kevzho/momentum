import { CheckCheckIcon } from "lucide-react";

import { formatCoverageShort, coverageOf } from "@momentum/core/tasks";
import { formatDuration, formatLocalDate } from "@momentum/core/time";

import { EmptyState } from "@momentum/ui/components/empty-state";
import { TaskRow } from "@momentum/ui/components/task-row";

import { TODAY_COPY } from "@/features/today/copy";
import { TodaySection } from "@/features/today/components/today-section";
import type { TodayTask } from "@/features/today/types";

/**
 * Tasks due today that have no time reserved anywhere.
 *
 * Deliberately narrow. A task due today that is already on the calendar is on
 * the timeline above, and a page that listed it in both places would be asking
 * the same question twice — which is the dashboard clutter the design system
 * names as a failure mode. What is left is the set the timeline cannot show:
 * work with a deadline today and no slot.
 *
 * Rows are the product's own `TaskRow`, so a task looks the same here as on
 * /tasks and is completed the same way.
 */
export function TodayTasks({
  tasks,
  pendingIds,
  onToggle,
}: {
  tasks: readonly TodayTask[];
  pendingIds: ReadonlySet<string>;
  onToggle: (task: TodayTask, completed: boolean) => void;
}) {
  const open = tasks.filter((task) => task.completedAt === null).length;

  return (
    <TodaySection
      title={TODAY_COPY.tasks.title}
      count={tasks.length === 0 ? undefined : String(open)}
    >
      {tasks.length === 0 ? (
        <EmptyState
          icon={CheckCheckIcon}
          title={TODAY_COPY.tasks.emptyTitle}
          description={TODAY_COPY.tasks.emptyDescription}
          compact
        />
      ) : (
        <ul className="flex flex-col gap-0.5">
          {tasks.map((task) => {
            const coverage = coverageOf(task.estimatedMinutes, task.scheduledMinutes);
            return (
              <li key={task.id} data-pending={pendingIds.has(task.id) || undefined}>
                <TaskRow
                  title={task.title}
                  completed={task.completedAt !== null}
                  priority={task.priority}
                  project={task.project}
                  due={task.dueDate === null ? null : formatLocalDate(task.dueDate, "monthDay")}
                  dueTone="due-soon"
                  estimate={
                    task.estimatedMinutes === null ? null : formatDuration(task.estimatedMinutes)
                  }
                  coverage={formatCoverageShort(coverage)}
                  onToggle={(next) => onToggle(task, next)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </TodaySection>
  );
}
