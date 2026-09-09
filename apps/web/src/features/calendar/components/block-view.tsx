"use client";

import { CheckIcon, SquareIcon } from "lucide-react";

import { formatTimeRange } from "@momentum/core/time";
import { CalendarBlock } from "@momentum/ui/components/calendar-block";

import {
  MIN_RENDERED_MINUTES,
  completionLabel,
  isCompletable,
} from "@/features/calendar/projection";
import type { BlockViewProps, CalendarCallbacks, CalendarItem } from "@/features/calendar/types";

// Below this many minutes a block has room for one line only (a half-hour
// block at 56px/hour is 28px).
const COMPACT_BELOW_MINUTES = 45;

// Below this rendered height a block has no room for padding either. Measured
// against the hour height so a non-default spec does not clip every short block.
const DENSE_HEIGHT_PX = 20;

/** What one block looks like; the shell and the geometry belong elsewhere. */
export function BlockView({ segment, settings, callbacks, ghost = false }: BlockViewProps) {
  const { item } = segment;
  const completed = item.completedAt !== null;
  const renderedMinutes = Math.max(segment.endMinutes - segment.startMinutes, MIN_RENDERED_MINUTES);

  // An unexecuted block of a completed task reads as settled, not outstanding.
  const settled = item.work !== null && item.work.taskCompletedAt !== null && !completed;

  // Only on the first segment, so a midnight-crossing block does not offer the
  // same action twice; never on the drag ghost.
  const showControl = !ghost && isCompletable(item) && segment.isStart;

  return (
    <CalendarBlock
      className="size-full"
      kind={item.kind}
      title={item.title}
      timeLabel={formatTimeRange(item.startAt, item.endAt, settings.timezone)}
      color={item.color}
      completed={completed}
      settled={settled}
      compact={renderedMinutes < COMPACT_BELOW_MINUTES}
      dense={(renderedMinutes / 60) * settings.spec.hourHeightPx < DENSE_HEIGHT_PX}
      continuesBefore={!segment.isStart}
      continuesAfter={!segment.isEnd}
      control={
        showControl ? (
          <CompletionControl item={item} onToggleComplete={callbacks.onToggleComplete} />
        ) : undefined
      }
    />
  );
}

/**
 * A real button (the shell around it is a `group`, not a `button`, so this
 * role survives). Both handlers stop propagation so completing a block does
 * not also open the editor. The `after` box enlarges the pointer target.
 */
function CompletionControl({
  item,
  onToggleComplete,
}: {
  item: CalendarItem;
  onToggleComplete: CalendarCallbacks["onToggleComplete"];
}) {
  const completed = item.completedAt !== null;

  return (
    <button
      type="button"
      data-slot="block-completion"
      // Out of the tab order: the grid keeps exactly two tab stops, and the
      // keyboard route to this action is Space on the focused block.
      tabIndex={-1}
      onClick={(event) => {
        event.stopPropagation();
        onToggleComplete(item);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") event.stopPropagation();
      }}
      className="relative shrink-0 rounded-md text-current after:absolute after:-inset-1 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {completed ? (
        <CheckIcon className="size-3" aria-hidden="true" />
      ) : (
        <SquareIcon className="size-3" aria-hidden="true" />
      )}
      <span className="sr-only">{completionLabel(item)}</span>
    </button>
  );
}
