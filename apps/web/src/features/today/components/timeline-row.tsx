import { formatDuration, formatMinutesOfDay } from "@momentum/core/time";

import { Checkbox } from "@momentum/ui/components/checkbox";
import { ProjectDot } from "@momentum/ui/components/project-dot";
import { cn } from "@momentum/ui/lib/utils";

import { completionLabel, isCompletable } from "@/features/calendar/projection";
import { isSettled } from "@/features/today/agenda";
import { TIMELINE_STATE_LABELS, TODAY_COPY } from "@/features/today/copy";
import type { TimelineState, TodayItem } from "@/features/today/types";

/**
 * One row of today's timeline. State is carried by emphasis, marker shape and
 * a word, never colour alone. The completion control is offered exactly where
 * the calendar offers it (`isCompletable`) and labelled by what the server
 * decided it will do.
 */
export function TimelineRow({
  entry,
  state,
  pending,
  onToggle,
}: {
  entry: TodayItem;
  state: TimelineState;
  pending: boolean;
  onToggle: (entry: TodayItem, completed: boolean) => void;
}) {
  const { item } = entry;
  const completed = item.completedAt !== null;
  const settled = isSettled(entry);
  const time = item.allDay ? TODAY_COPY.timeline.allDay : formatMinutesOfDay(entry.startMinutes);

  const meta = [
    entry.project?.name ?? KIND_NOUN[item.kind],
    formatDuration(entry.durationMinutes),
    entry.startsBeforeToday ? TODAY_COPY.timeline.fromYesterday : null,
    entry.endsAfterToday ? TODAY_COPY.timeline.intoTomorrow : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");

  return (
    <li
      data-slot="timeline-row"
      data-state={state}
      data-completed={completed || undefined}
      data-pending={pending || undefined}
      className={cn(
        "group flex items-stretch gap-2 rounded-md py-1 pr-2 transition-colors duration-fast ease-standard",
        "hover:bg-muted/50 has-focus-visible:bg-muted/50",
        state === "past" && "opacity-70",
        pending && "opacity-60",
      )}
    >
      <span
        data-slot="numeric"
        className={cn(
          "w-11 shrink-0 pt-1 pl-2 text-right text-xs tabular-nums",
          state === "current" ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {time}
      </span>

      {/* The rail; the marker's shape carries the state so it reads in greyscale. */}
      <span aria-hidden="true" className="relative flex w-3 shrink-0 justify-center self-stretch">
        <span className="absolute inset-y-0 w-px bg-border" />
        <span
          className={cn(
            "relative mt-1.5 size-2 rounded-full border bg-background",
            state === "current" && "size-2.5 border-primary bg-primary ring-3 ring-primary/20",
            state === "past" && "border-muted-foreground/50",
            state === "future" && "border-border",
          )}
        />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {item.kind === "event" || entry.project !== null ? (
            <ProjectDot color={item.color} />
          ) : null}
          <span
            className={cn(
              "min-w-0 truncate text-sm",
              completed && "text-muted-foreground line-through",
              settled && !completed && "text-muted-foreground",
            )}
          >
            {item.title}
          </span>
          {state === "current" ? (
            <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-2xs font-medium text-primary">
              {TIMELINE_STATE_LABELS.current}
            </span>
          ) : null}
        </div>
        <span className="truncate text-xs text-muted-foreground">{meta}</span>
      </div>

      {isCompletable(item) && item.blockId !== null ? (
        <span className="flex shrink-0 items-center pl-1">
          <Checkbox
            shape="round"
            checked={completed}
            aria-label={completionLabel(item)}
            onCheckedChange={(next) => onToggle(entry, next === true)}
          />
        </span>
      ) : (
        // Reserving the width keeps the column straight.
        <span className="w-4 shrink-0" />
      )}

      {/* "Now" is already a visible chip; opacity and strike-through are not announced, so the word is supplied here. */}
      {state === "current" ? null : (
        <span className="sr-only">
          {completed ? TODAY_COPY.timeline.done : TIMELINE_STATE_LABELS[state]}
        </span>
      )}
    </li>
  );
}

/** What to call a row that has no project to name: the kind, as a word. */
const KIND_NOUN: Record<TodayItem["item"]["kind"], string> = {
  event: "Event",
  work: "Task",
  habit: "Habit",
};
