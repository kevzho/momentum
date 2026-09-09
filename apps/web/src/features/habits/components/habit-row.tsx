"use client";

import * as React from "react";
import { CalendarPlusIcon, MoreHorizontalIcon } from "lucide-react";

import { addDays, formatLocalDate } from "@momentum/core/time";
import type { LocalDate } from "@momentum/core/types";

import { Button } from "@momentum/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@momentum/ui/components/dropdown-menu";
import { HabitCard, type HabitCardDay } from "@momentum/ui/components/habit-card";

import {
  DAY_STATE_LABELS,
  HABITS_COPY,
  describeProgress,
  describeTarget,
  formatRate,
} from "@/features/habits/copy";
import type { HabitView, HabitsPageData } from "@/features/habits/types";

/**
 * One habit in the list. Only the days the database will accept (yesterday,
 * today, tomorrow) are pressable. While the row is writing, the handler refuses
 * presses to match `HabitCard`'s `aria-disabled`, so a quick second press cannot
 * read the optimistic "done" and un-record the day.
 */
export interface HabitRowProps {
  view: HabitView;
  page: HabitsPageData;
  /** True while a mutation for this habit is in flight. */
  pending: boolean;
  onToggleDay: (view: HabitView, date: LocalDate) => void;
  onOpen: (view: HabitView) => void;
  onEdit: (view: HabitView) => void;
  onAddToWeek: (view: HabitView) => void;
  onArchive: (view: HabitView, archived: boolean) => void;
  onDelete: (view: HabitView) => void;
}

/** The window `record_habit_completion` accepts; `today` is the server-resolved profile-timezone date. */
export function isRecordable(date: LocalDate, today: LocalDate): boolean {
  return date >= addDays(today, -1) && date <= addDays(today, 1);
}

export function HabitRow({
  view,
  page,
  pending,
  onToggleDay,
  onOpen,
  onEdit,
  onAddToWeek,
  onArchive,
  onDelete,
}: HabitRowProps) {
  const archived = view.habit.archivedAt !== null;

  // A menu item's action runs from `onCloseAutoFocus`, not `onSelect`: a surface
  // opened while the item is unmounting records `<body>` as its opener.
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const chosen = React.useRef<(() => void) | null>(null);
  const choose = React.useCallback((action: () => void) => {
    chosen.current = action;
  }, []);

  const week: HabitCardDay[] = view.week.map((day) => {
    const recordable = !archived && isRecordable(day.date, page.today);
    const reserved = view.reservedDates.includes(day.date);

    return {
      key: day.date,
      short: formatLocalDate(day.date, "weekday").slice(0, 1),
      state: day.state,
      label: [
        formatLocalDate(day.date, "long"),
        `${DAY_STATE_LABELS[day.state].toLowerCase()}`,
        reserved ? "time reserved" : null,
        recordable ? null : "not recordable today",
      ]
        .filter((part) => part !== null)
        .join(" · "),
      ...(recordable
        ? {
            onSelect: () => {
              if (pending) return;
              onToggleDay(view, day.date);
            },
          }
        : {}),
      disabled: pending,
    };
  });

  return (
    <HabitCard
      name={
        <button
          type="button"
          onClick={() => onOpen(view)}
          className="truncate rounded-md text-left hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {view.habit.name}
        </button>
      }
      target={describeTarget(view.habit)}
      progress={describeProgress(view.habit, view.progress.achieved, view.progress.target)}
      week={week}
      weekLabel={`${view.habit.name}, this week`}
      consistency={formatRate(view.stats.consistency)}
      consistencyLabel={HABITS_COPY.consistencyHint}
      xpReward={view.habit.xpReward}
      color={view.habit.color}
      className={archived ? "opacity-70" : undefined}
      actions={
        <>
          {archived ? null : (
            <Button
              size="icon-sm"
              variant="ghost"
              title={HABITS_COPY.addToWeekHint}
              onClick={() => onAddToWeek(view)}
            >
              <CalendarPlusIcon aria-hidden="true" />
              <span className="sr-only">
                {HABITS_COPY.addToWeek}: {view.habit.name}
              </span>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button ref={triggerRef} size="icon-sm" variant="ghost">
                <MoreHorizontalIcon aria-hidden="true" />
                <span className="sr-only">Options for {view.habit.name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onCloseAutoFocus={(event) => {
                const action = chosen.current;
                chosen.current = null;
                if (action === null) return;
                event.preventDefault();
                triggerRef.current?.focus();
                action();
              }}
            >
              <DropdownMenuItem onSelect={() => choose(() => onOpen(view))}>
                View history
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => choose(() => onEdit(view))}>Edit</DropdownMenuItem>
              {archived ? null : (
                <DropdownMenuItem onSelect={() => choose(() => onAddToWeek(view))}>
                  {HABITS_COPY.addToWeek}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => choose(() => onArchive(view, !archived))}>
                {archived ? "Restore" : "Archive"}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => choose(() => onDelete(view))}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    />
  );
}
