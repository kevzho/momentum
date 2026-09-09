import { CheckCheckIcon } from "lucide-react";

import { formatCoverageShort, coverageOf } from "@momentum/core/tasks";
import { formatDuration, formatLocalDate } from "@momentum/core/time";

import { EmptyState } from "@momentum/ui/components/empty-state";
import { TaskRow } from "@momentum/ui/components/task-row";

import { TODAY_COPY } from "@/features/today/copy";
import { TodaySection } from "@/features/today/components/today-section";
import type { TodayTask } from "@/features/today/types";

/** Tasks due today with no time reserved anywhere; a scheduled one is on the timeline instead. */
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
