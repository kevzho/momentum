import Link from "next/link";
import type { Route } from "next";
import { CheckIcon, PartyPopperIcon, SunriseIcon, TimerIcon } from "lucide-react";

import { MAX_PLANNED_MINUTES, MIN_PLANNED_MINUTES } from "@momentum/core/focus";
import { formatDuration, formatTimeRange } from "@momentum/core/time";
import type { IanaTimeZone, Minutes } from "@momentum/core/types";

import { Button } from "@momentum/ui/components/button";
import { ProjectDot } from "@momentum/ui/components/project-dot";
import { cn } from "@momentum/ui/lib/utils";

import { completionLabel, isCompletable } from "@/features/calendar/projection";
import { TODAY_COPY, nextUpReasonLabel } from "@/features/today/copy";
import { TodaySection } from "@/features/today/components/today-section";
import type { NextUp, TodayItem, TodayTask } from "@/features/today/types";

/**
 * What should I do next — the most important component on the page, and the one
 * that must always have a sensible answer.
 *
 * Four states, all of them written out (`selectNextUp` in `agenda.ts` decides
 * which): the next scheduled item, including one already running; the soonest
 * deadline when the day holds nothing scheduled; a genuinely pleasant
 * everything-done state; and an open day. None of them is an error state and
 * none of them scolds (Domain Rule 7).
 *
 * Start focus is a **link**, never a button. A button would start a session,
 * and a session started by navigation would start again every time the page was
 * returned to — including by the back button. The timer is started by a press
 * on /focus, which is Phase 7's decision and the reason `?task=` and `?minutes=`
 * exist.
 */
export function NextUpPanel({
  nextUp,
  timezone,
  pendingIds,
  onCompleteBlock,
  onCompleteTask,
  onReschedule,
}: {
  nextUp: NextUp;
  timezone: IanaTimeZone;
  pendingIds: ReadonlySet<string>;
  onCompleteBlock: (entry: TodayItem, completed: boolean) => void;
  onCompleteTask: (task: TodayTask, completed: boolean) => void;
  onReschedule: (entry: TodayItem) => void;
}) {
  return (
    <TodaySection title={TODAY_COPY.nextUp.title}>
      <div
        data-slot="next-up"
        className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3"
      >
        {nextUp.kind === "block" ? (
          <BlockNextUp
            nextUp={nextUp}
            timezone={timezone}
            pending={pendingIds.has(nextUp.entry.item.id)}
            onComplete={onCompleteBlock}
            onReschedule={onReschedule}
          />
        ) : nextUp.kind === "task" ? (
          <TaskNextUp
            task={nextUp.task}
            reason={nextUp.reason}
            pending={pendingIds.has(nextUp.task.id)}
            onComplete={onCompleteTask}
          />
        ) : (
          <ClearDay nextUp={nextUp} />
        )}
      </div>
    </TodaySection>
  );
}

/* -------------------------------------------------------------------------- */
/* A scheduled block                                                          */
/* -------------------------------------------------------------------------- */

function BlockNextUp({
  nextUp,
  timezone,
  pending,
  onComplete,
  onReschedule,
}: {
  nextUp: Extract<NextUp, { kind: "block" }>;
  timezone: IanaTimeZone;
  pending: boolean;
  onComplete: (entry: TodayItem, completed: boolean) => void;
  onReschedule: (entry: TodayItem) => void;
}) {
  const { entry, inProgress } = nextUp;
  const { item } = entry;
  const taskId = item.work?.taskId ?? null;

  return (
    <>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {inProgress ? (
            <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-2xs font-medium text-primary">
              {TODAY_COPY.nextUp.now}
            </span>
          ) : null}
          {entry.project === null ? null : <ProjectDot color={item.color} />}
          <span className="min-w-0 truncate text-sm font-medium">{item.title}</span>
        </div>
        <p data-slot="numeric" className="text-xs text-muted-foreground">
          {[
            entry.project?.name,
            item.allDay
              ? TODAY_COPY.timeline.allDay
              : formatTimeRange(item.startAt, item.endAt, timezone),
            formatDuration(entry.durationMinutes),
          ]
            .filter((part): part is string => part !== undefined && part !== "")
            .join(" · ")}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" asChild>
          <Link href={focusHref(taskId, entry.durationMinutes)}>
            <TimerIcon aria-hidden="true" />
            {TODAY_COPY.nextUp.startFocus}
          </Link>
        </Button>

        {isCompletable(item) && item.blockId !== null ? (
          <Button
            variant="outline"
            size="sm"
            data-pending={pending || undefined}
            onClick={() => onComplete(entry, true)}
          >
            <CheckIcon aria-hidden="true" />
            {completionLabel(item)}
          </Button>
        ) : null}

        {/* A virtual occurrence has a row written for it by the override path,
            so it can be moved; only an all-day item has no time to move. */}
        {item.allDay ? null : (
          <Button variant="ghost" size="sm" onClick={() => onReschedule(entry)}>
            {TODAY_COPY.nextUp.reschedule}
          </Button>
        )}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Nothing scheduled — what is due soonest                                    */
/* -------------------------------------------------------------------------- */

function TaskNextUp({
  task,
  reason,
  pending,
  onComplete,
}: {
  task: TodayTask;
  reason: Extract<NextUp, { kind: "task" }>["reason"];
  pending: boolean;
  onComplete: (task: TodayTask, completed: boolean) => void;
}) {
  return (
    <>
      <p className="text-xs text-muted-foreground">{TODAY_COPY.nextUp.unscheduled}</p>

      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {task.project === null ? null : <ProjectDot color={task.project.color} />}
          <span className="min-w-0 truncate text-sm font-medium">{task.title}</span>
        </div>
        <p data-slot="numeric" className="text-xs text-muted-foreground">
          {[
            task.project?.name,
            nextUpReasonLabel(reason, task.dueDate),
            task.estimatedMinutes === null ? undefined : formatDuration(task.estimatedMinutes),
          ]
            .filter((part): part is string => part !== undefined && part !== "")
            .join(" · ")}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" asChild>
          <Link href={focusHref(task.id, task.estimatedMinutes)}>
            <TimerIcon aria-hidden="true" />
            {TODAY_COPY.nextUp.startFocus}
          </Link>
        </Button>
        <Button
          variant="outline"
          size="sm"
          data-pending={pending || undefined}
          onClick={() => onComplete(task, true)}
        >
          <CheckIcon aria-hidden="true" />
          {TODAY_COPY.nextUp.completeTask}
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/calendar">{TODAY_COPY.nextUp.planWeek}</Link>
        </Button>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Nothing left                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The two states with nothing to start.
 *
 * They are deliberately different. Finishing a day's work is worth saying so;
 * an empty day is not an achievement and is not a reproach either — it is a
 * day with room in it, and the copy says that and offers the calendar.
 */
function ClearDay({ nextUp }: { nextUp: Extract<NextUp, { kind: "done" | "empty" }> }) {
  const done = nextUp.kind === "done";
  const Icon = done ? PartyPopperIcon : SunriseIcon;

  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          done ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-medium">
          {done ? TODAY_COPY.nextUp.doneTitle : TODAY_COPY.nextUp.emptyTitle}
        </p>
        <p className="text-xs text-muted-foreground">
          {done
            ? TODAY_COPY.nextUp.doneDescription(nextUp.completed)
            : TODAY_COPY.nextUp.emptyDescription}
        </p>
        <Button variant="outline" size="sm" className="mt-1 self-start" asChild>
          <Link href="/calendar">{TODAY_COPY.nextUp.planWeek}</Link>
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The focus link                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `/focus?task=&minutes=` — the two parameters Phase 7 shaped for exactly this.
 *
 * The length is the block's own, clamped to the bounds `focus_planned_chk`
 * enforces, so the page it opens is already set up and no value it carries can
 * be one the schema refuses. A block with no task still links: attributing a
 * session is optional, and the length is still worth carrying.
 */
function focusHref(taskId: string | null, minutes: Minutes | null): Route {
  const params = new URLSearchParams();
  if (taskId !== null) params.set("task", taskId);
  if (minutes !== null && minutes > 0) {
    params.set(
      "minutes",
      String(Math.min(MAX_PLANNED_MINUTES, Math.max(MIN_PLANNED_MINUTES, Math.round(minutes)))),
    );
  }
  const query = params.toString();
  return query === "" ? "/focus" : `/focus?${query}`;
}
