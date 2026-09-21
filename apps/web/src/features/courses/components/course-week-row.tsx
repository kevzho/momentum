"use client";

import Link from "next/link";
import { PlusIcon } from "lucide-react";

import { formatLocalDate } from "@momentum/core/time";
import type { LocalDate, Task } from "@momentum/core/types";

import { Button } from "@momentum/ui/components/button";
import { cn } from "@momentum/ui/lib/utils";

import { CommittedInput, CommittedTextarea } from "@/components/committed-field";
import type { CourseWeekView } from "@/features/courses/types";
import { taskHref } from "@/features/tasks/view-params";

/**
 * One week of the term: its dates, a topic, the material to cover, and the
 * assignments due inside it. Topic and material commit on blur; assignments
 * are the project's tasks and open in the task sheet.
 */
export function CourseWeekRow({
  view,
  today,
  pending,
  onCommit,
  onAddAssignment,
}: {
  view: CourseWeekView;
  today: LocalDate;
  pending: boolean;
  onCommit: (patch: { topic: string | null; materials: string | null }) => void;
  onAddAssignment: (view: CourseWeekView) => void;
}) {
  const { span, week, assignments, isCurrent } = view;
  const topic = week?.topic ?? "";
  const materials = week?.materials ?? "";
  const ids = `course-week-${span.number}`;

  return (
    <section
      aria-labelledby={`${ids}-heading`}
      className={cn("flex flex-col gap-2 py-3", isCurrent && "-mx-2 rounded-md bg-accent/40 px-2")}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={`${ids}-heading`} className="flex items-baseline gap-2 text-sm font-medium">
          <span>Week {span.number}</span>
          <span data-slot="numeric" className="text-xs font-normal text-muted-foreground">
            {formatLocalDate(span.start, "monthDay")} – {formatLocalDate(span.end, "monthDay")}
          </span>
          {isCurrent ? (
            <span className="rounded-sm bg-primary/10 px-1.5 text-2xs font-medium text-primary">
              This week
            </span>
          ) : null}
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7"
          aria-disabled={pending || undefined}
          onClick={() => {
            if (!pending) onAddAssignment(view);
          }}
        >
          <PlusIcon aria-hidden="true" />
          Add assignment
        </Button>
      </div>

      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          <CommittedInput
            aria-label={`Week ${span.number} topic`}
            placeholder="Topic"
            className="h-8"
            value={topic}
            onCommit={(next) =>
              onCommit({ topic: emptyToNull(next), materials: emptyToNull(materials) })
            }
          />
          <CommittedTextarea
            aria-label={`Week ${span.number} material`}
            placeholder="Readings, links, what to cover"
            rows={2}
            className="min-h-0"
            value={materials}
            onCommit={(next) =>
              onCommit({ topic: emptyToNull(topic), materials: emptyToNull(next) })
            }
          />
        </div>

        <ul
          aria-label={`Week ${span.number} assignments`}
          className="flex flex-col gap-0.5 text-sm"
        >
          {assignments.length === 0 ? (
            <li className="text-xs text-muted-foreground">Nothing due this week.</li>
          ) : (
            assignments.map((task) => <AssignmentRow key={task.id} task={task} today={today} />)
          )}
        </ul>
      </div>
    </section>
  );
}

export function AssignmentRow({ task, today }: { task: Task; today: LocalDate }) {
  const done = task.status === "completed";
  const due = task.dueDate;
  const tone =
    due === null || done
      ? "text-muted-foreground"
      : due < today
        ? "text-destructive"
        : due === today
          ? "text-warning"
          : "text-muted-foreground";

  return (
    <li>
      <Link
        href={taskHref({ taskId: task.id })}
        className="flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors duration-fast ease-standard hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span
          aria-hidden="true"
          className={cn(
            "size-3 shrink-0 rounded-full border",
            done ? "border-primary bg-primary" : "border-input",
          )}
        />
        <span
          className={cn("min-w-0 flex-1 truncate", done && "text-muted-foreground line-through")}
        >
          {task.title}
        </span>
        <span data-slot="numeric" className={cn("shrink-0 text-xs", tone)}>
          {due === null
            ? "No due date"
            : formatLocalDate(due, due === today ? "weekday" : "monthDay")}
        </span>
        <span className="sr-only">{done ? ", completed" : ""}</span>
      </Link>
    </li>
  );
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
