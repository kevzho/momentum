"use client";

import * as React from "react";

import {
  findTime,
  type Commitment,
  type FindTimeCandidate,
  type PlanningContext,
} from "@momentum/core/scheduling";
import { startOfDay } from "@momentum/core/time";
import type { Instant, LocalDate, Uuid } from "@momentum/core/types";

import { useAnnounce } from "@momentum/ui/components/announcer";
import { Button } from "@momentum/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@momentum/ui/components/dialog";

import { scheduledMessage } from "@/features/calendar/announcements";
import type { CalendarSettings, DaySpan, PlanTask } from "@/features/calendar/types";
import { ScheduleTaskContent } from "@/features/planning/components/schedule-task-dialog";
import { FIND_TIME } from "@/features/planning/copy";
import { taskBlockMinutes } from "@/features/planning/live";
import { useOpenerFocus } from "@/lib/use-opener-focus";

/**
 * Find Time for one task. `findTime` runs in a `useMemo` over the optimistic
 * week, never on the server; a candidate's `span` is sent verbatim.
 */

export interface FindTimeDialogProps {
  /** The task to place; `null` closes the dialog. */
  task: PlanTask | null;
  /** The board as the user sees it right now. */
  commitments: readonly Commitment[];
  context: PlanningContext;
  settings: CalendarSettings;
  /** The displayed range, for the manual fallback's default date. */
  days: readonly LocalDate[];
  today: LocalDate;
  /** The current instant after hydration; null before it. */
  now: Instant | null;
  onScheduleTask: (taskId: Uuid, span: DaySpan) => void;
  onClose: () => void;
}

export function FindTimeDialog({ task, onClose, ...content }: FindTimeDialogProps) {
  const openerFocus = useOpenerFocus();

  return (
    <Dialog
      open={task !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {task === null ? null : (
        <DialogContent
          onOpenAutoFocus={openerFocus.onOpenAutoFocus}
          onCloseAutoFocus={openerFocus.onCloseAutoFocus}
        >
          {/* Keyed by task, so a different task starts from the candidate list again. */}
          <FindTimeContent key={task.id} task={task} onClose={onClose} {...content} />
        </DialogContent>
      )}
    </Dialog>
  );
}

type Mode = "candidates" | "manual";

function FindTimeContent({
  task,
  commitments,
  context,
  settings,
  days,
  today,
  now,
  onScheduleTask,
  onClose,
}: Omit<FindTimeDialogProps, "task"> & { task: PlanTask }) {
  const announce = useAnnounce();
  const ids = React.useId();
  const [mode, setMode] = React.useState<Mode>("candidates");

  // Read once on open: `now` ticks every minute and the list must not reshuffle under the pointer.
  const [searchedAt] = React.useState<Instant>(() => now ?? startOfDay(today, settings.timezone));

  const result = React.useMemo(
    () =>
      findTime({
        task: { id: task.id, title: task.title, dueDate: task.dueDate },
        durationMinutes: taskBlockMinutes(task),
        commitments,
        context,
        now: searchedAt,
        snapMinutes: settings.snapMinutes,
      }),
    [task, commitments, context, searchedAt, settings.snapMinutes],
  );

  if (mode === "manual") {
    return (
      <ScheduleTaskContent
        task={task}
        settings={settings}
        days={days}
        today={today}
        onSchedule={onScheduleTask}
        onClose={onClose}
        autoFocusDate
      />
    );
  }

  function schedule(candidate: FindTimeCandidate) {
    onScheduleTask(task.id, candidate.span);
    announce(scheduledMessage(task.title, candidate.span));
    onClose();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{FIND_TIME.title}</DialogTitle>
        <DialogDescription>{task.title}</DialogDescription>
      </DialogHeader>

      {result.note === null ? null : <p className="text-xs text-muted-foreground">{result.note}</p>}

      {/* Radix focuses the first tabbable on open: the first Schedule button, or the fallback below. */}
      {result.candidates.length === 0 ? null : (
        <ol aria-label={FIND_TIME.candidates} className="flex flex-col gap-0.5">
          {result.candidates.map((candidate, index) => {
            const explanationId = `${ids}-candidate-${index}`;
            return (
              <li
                key={`${candidate.startAt}:${candidate.endAt}`}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors duration-fast ease-standard hover:bg-muted/60"
              >
                <span id={explanationId} className="min-w-0 flex-1 text-sm">
                  {candidate.explanation}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  aria-describedby={explanationId}
                  onClick={() => schedule(candidate)}
                >
                  {FIND_TIME.schedule}
                </Button>
              </li>
            );
          })}
        </ol>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" size="sm" onClick={() => setMode("manual")}>
          {FIND_TIME.pickManually}
        </Button>
      </DialogFooter>
    </>
  );
}
