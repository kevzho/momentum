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

/**
 * What one block looks like. The shell around it — draggable, focusable,
 * resizable — belongs to the interaction layer; the geometry that placed it
 * belongs to the grid. This decides only what the user reads.
 *
 * Below this many minutes a block has room for one line, so the time range
 * moves out of the body and into the block's text for assistive technology.
 * 45 rather than 30: at 56px an hour, a half-hour block is 28px, which is two
 * lines of 11px type only if nothing else is in the box.
 */
const COMPACT_BELOW_MINUTES = 45;

/**
 * And below this, a block has no room for padding either: at 56px an hour a
 * 15-minute block is 14px, which is less than one padded line of `text-2xs`.
 * Measured against the hour height rather than assumed, so a non-default spec
 * does not silently clip every short block.
 */
const DENSE_HEIGHT_PX = 20;

/**
 * Domain Rule 13 fixes this wording, and the server decides which of the two
 * applies: the last incomplete block of a task completes the task, any other
 * block completes only itself. The user should never have to guess which of
 * those a click is about to do.
 */
export function BlockView({ segment, settings, callbacks, ghost = false }: BlockViewProps) {
  const { item } = segment;
  const completed = item.completedAt !== null;
  const renderedMinutes = Math.max(segment.endMinutes - segment.startMinutes, MIN_RENDERED_MINUTES);

  // Domain Rule 13: an unexecuted block of a completed task stays on the
  // board and reads as settled rather than as outstanding work.
  const settled = item.work !== null && item.work.taskCompletedAt !== null && !completed;

  // The control belongs to the block, not to the day: a block cut in two by
  // midnight would otherwise offer the same action twice, on two rows that are
  // one thing. The ghost that follows the pointer carries no controls at all.
  //
  // A habit block carries one too (Phase 6): completing it records the habit
  // for the block's own day. It is offered only while the database would accept
  // that recording — or, on a block already done, to undo it — so the control
  // never promises something that must fail, exactly as its wording never
  // promises the wrong effect.
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
 * A real button, because completing a block is an action and not a state the
 * block happens to be in. It sits in the block's glyph slot, so it renders the
 * work kind's own square/check glyph and the shape language survives.
 *
 * Both handlers stop propagation: the block around it opens the editor on
 * click and on Enter, and completing a block from the board should not also
 * put the user in a form. The invisible `after` box gives a 12px glyph a
 * pointer target worth aiming at, clipped by the block so it can never reach
 * into the neighbouring one.
 *
 * It is a real button rather than a styled span because it is still exposed to
 * assistive technology — the shell around it is a `group`, not a `button`, so
 * this control's role and its Domain Rule 13 name survive.
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
      /*
       * Out of the tab order on purpose. The grid keeps exactly two tab stops —
       * one column, one block — and a native button inside every work block
       * would add one per block, so tabbing off the calendar would walk the
       * whole week. The keyboard route to the same action is `Space` on the
       * focused block, which the block's own description announces; this
       * control is the pointer route to it.
       */
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
